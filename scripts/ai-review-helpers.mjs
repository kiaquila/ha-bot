export const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function isTrustedAssociation(value) {
  return trustedAssociations.has(String(value || "").toUpperCase());
}

export function extractClaudeOutcome(body) {
  const match = String(body || "").match(/^AI_REVIEW_OUTCOME:\s*(pass|advisory|block)\s*$/im);
  return match?.[1]?.toLowerCase() || null;
}

export function extractMarkerSha(body) {
  const match = String(body || "").match(/^AI_REVIEW_SHA:\s*([a-f0-9]{7,40})\s*$/im);
  return match?.[1] || null;
}

export function createAiReviewRequestMarkerBody({
  agent,
  headSha,
  requestId,
  sourceCommentId,
  sourceCommentCreatedAt,
  requestedAt
}) {
  const recordedAt = requestedAt || new Date().toISOString();
  return [
    `AI review request recorded for \`${String(headSha || "").slice(0, 10)}\`.`,
    "",
    "<!-- unicorn-hub:ai-review-request",
    `AI_REVIEW_REQUEST_ID: ${requestId}`,
    `AI_REVIEW_AGENT: ${String(agent || "").trim().toLowerCase()}`,
    `AI_REVIEW_SHA: ${headSha}`,
    `AI_REVIEW_SOURCE_COMMENT_ID: ${sourceCommentId}`,
    `AI_REVIEW_SOURCE_COMMENT_CREATED_AT: ${sourceCommentCreatedAt || recordedAt}`,
    `AI_REVIEW_REQUESTED_AT: ${recordedAt}`,
    "-->"
  ].join("\n");
}

export function extractAiReviewRequestMarker(body) {
  const text = String(body || "");
  if (!text.includes("unicorn-hub:ai-review-request")) return null;

  const field = (name) => text.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "im"))?.[1]?.trim() || null;
  const requestId = field("AI_REVIEW_REQUEST_ID");
  const agent = field("AI_REVIEW_AGENT")?.toLowerCase();
  const sha = field("AI_REVIEW_SHA");
  const sourceCommentId = field("AI_REVIEW_SOURCE_COMMENT_ID");
  const sourceCommentCreatedAt = field("AI_REVIEW_SOURCE_COMMENT_CREATED_AT");
  const requestedAt = field("AI_REVIEW_REQUESTED_AT");

  if (!requestId || !agent || !sha || !sourceCommentId || !requestedAt) return null;
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) return null;

  return {
    requestId,
    agent,
    sha,
    sourceCommentId,
    sourceCommentCreatedAt,
    requestedAt
  };
}

export function normalizeLogin(login) {
  return String(login || "").toLowerCase();
}

const defaultTrustedReviewLogins = {
  codex: ["chatgpt-codex-connector[bot]"],
  claude: ["claude[bot]"],
  gemini: ["gemini-code-assist[bot]"]
};

export function trustedReviewLoginsForAgent(agent, config = {}) {
  return new Set([
    ...(defaultTrustedReviewLogins[agent] || []),
    ...(config.trustedReviewLogins || []),
    ...(config.trustedReviewLoginsByAgent?.[agent] || [])
  ].map(normalizeLogin));
}

export function isTrustedReviewLogin(login, agent, config = {}) {
  return trustedReviewLoginsForAgent(agent, config).has(normalizeLogin(login));
}

export function isAiReviewRequestMarkerComment(comment, agent, headSha) {
  const login = normalizeLogin(comment?.user?.login);
  if (login !== "github-actions[bot]") return false;
  const marker = extractAiReviewRequestMarker(comment?.body);
  if (!marker) return false;
  return marker.agent === String(agent || "").toLowerCase() && marker.sha === headSha;
}

export function latestAiReviewRequestMarker(comments = [], agent, headSha) {
  return comments
    .map((comment) => {
      const marker = extractAiReviewRequestMarker(comment?.body);
      if (!marker) return null;
      return {
        ...marker,
        commentId: String(comment.id || ""),
        commentCreatedAt: comment.created_at || null,
        author: comment.user?.login || null
      };
    })
    .filter((marker) =>
      marker &&
      normalizeLogin(marker.author) === "github-actions[bot]" &&
      marker.agent === String(agent || "").toLowerCase() &&
      marker.sha === headSha
    )
    .sort((left, right) =>
      Date.parse(right.commentCreatedAt || right.requestedAt || "") -
      Date.parse(left.commentCreatedAt || left.requestedAt || "")
    )[0] || null;
}

export function containsBlockingSeverity(body, agent) {
  const text = String(body || "");
  if (agent === "codex") {
    return /\bP[0-2]\b/i.test(text);
  }
  if (agent === "gemini") {
    return /\b(critical|high)\b/i.test(text);
  }
  return false;
}

export function extractCodexPriority(body) {
  const matches = [...String(body || "").matchAll(/\bP([0-3])\b/gi)];
  return matches.length ? Math.min(...matches.map((match) => Number(match[1]))) : null;
}



function codeCompletionTime(comment) {
  const rows = String(comment?.body || "").split(/\r?\n/).filter((line) => line.startsWith("|") && line.includes("**Code Review**"));
  if (rows.length !== 1) return null;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const edited = Date.parse(comment?.updated_at || comment?.created_at || "");
  return Number.isFinite(value) && Number.isFinite(edited) && value <= edited + 999 ? match[1] : null;
}

export function verdictTime(comment, result, headSha = null, config = {}) {
  {
    const state = typedCodexState(comment);
    if (state && validFindingCompanions(comment, state, headSha, config)) {
      const clocks = ["code_review", "security_review"].filter((kind) =>
        (headSha === null || state[kind].commit_sha === headSha) &&
        (state[kind].has_any_findings === true || state[kind].has_unresolved_findings === true)
      ).map((kind) => state[kind].status === "completed" && canonicalSectionClear(comment,
        { ...state, [kind]: { ...state[kind], has_any_findings: false, has_unresolved_findings: false } },
        kind, state[kind].commit_sha, config) ? sectionCompletionBucket(comment, kind, state[kind].commit_sha) : NaN);
      if (clocks.length && clocks.every(Number.isFinite)) return new Date(Math.max(...clocks) * 1000).toISOString();
    }
  }

  const legacyPositive = /^Codex Review:\s*Did(?: not|n't|n’t) find any major issues\.(?: :rocket:| Keep it up!)?\s*(?:<details>[\s\S]*<\/details>)?\s*$/i.test(String(comment?.body || "").trim());
  return result === "pass" && String(comment?.body || "").trim().startsWith(summaryMarker)
    ? codeCompletionTime(comment) : result === "pass" || legacyPositive ? comment?.created_at : comment?.updated_at || comment?.created_at;
}

const receiptMarker = "<!-- codex-review-receipt:v1 -->";
const summaryMarker = "<!-- codex-pull-request-review-summary -->";

export function isCodexReviewSignal(body) {
  const text = String(body || "").trim();
  return /^Codex Review:/i.test(text) ||
    /^<!-- codex-(?:review-receipt:|pull-request-review-summary|review-state:)/.test(text);
}

function exactlyKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function parseStructuredCodexSummary(body, headSha, requestMarker) {
  const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (.*?) -->\s*## Codex Review Summary(?:\n|$)/s);
  if (!match || (body.match(/codex-pull-request-review-summary/g) || []).length !== 1 ||
      (body.match(/codex-review-state:/g) || []).length !== 1 || body.includes("codex-review-receipt:")) return null;
  let state;
  try { state = JSON.parse(match[1]); } catch { return null; }
  // Round-tripping rejects duplicate JSON keys instead of silently taking the last value.
  const compact = match[1].replace(/"(?:\.|[^"\\])*"|\s+/g, (token) => token.startsWith('"') ? token : "");
  if (JSON.stringify(state) !== compact || !exactlyKeys(state, ["code_review", "security_review"])) return null;
  for (const value of Object.values(state)) {
    if (!exactlyKeys(value, ["commit_sha", "has_any_findings", "has_unresolved_findings", "status"])) return null;
    if (value.commit_sha === null && value.status === null &&
        value.has_any_findings === null && value.has_unresolved_findings === null) continue;
    if (typeof value.commit_sha !== "string" || !/^[a-f0-9]{40}$/.test(value.commit_sha) ||
        typeof value.has_any_findings !== "boolean" || typeof value.has_unresolved_findings !== "boolean" ||
        !["completed", "in_progress", "queued", "pending", "failed", "cancelled"].includes(value.status) ||
        (!value.has_any_findings && value.has_unresolved_findings)) return null;
  }
  const code = state.code_review;
  if (code.commit_sha !== headSha) return null;
  if (code.has_any_findings || Object.values(state).some((value) => value.has_unresolved_findings) || containsBlockingSeverity(body, "codex")) return "fail";
  const security = state.security_review;
  const securityAbsent = Object.values(security).every((value) => value === null);
  if (!securityAbsent && (security.commit_sha !== headSha || security.status !== "completed" ||
      security.has_any_findings !== false || security.has_unresolved_findings !== false)) return "fail";
  if (code.status !== "completed") return "pending";
  // Visible code-review rows must agree with the machine-readable state.
  const rows = body.split("\n").filter((line) => line.startsWith("|") && line.includes("**Code Review**"));
  if (rows.length !== 1) return null;
  const cells = rows[0].split("|").map((cell) => cell.trim());
  const completed = cells[2]?.match(/^✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time>$/);
  const requestedAt = Date.parse(requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || requestMarker?.commentCreatedAt || "");
  if (cells.length !== 6 || !completed || completed[1] !== completed[2] ||
      !Number.isFinite(requestedAt) || !Number.isFinite(Date.parse(completed[1])) ||
      Math.floor(Date.parse(completed[1]) / 1000) <= Math.floor(requestedAt / 1000) || cells[3] !== `\`${headSha.slice(0, 7)}\``) return null;
  const securityRows = body.split("\n").filter((line) => line.startsWith("|") && line.includes("**Security Review**"));
  if (securityRows.length !== (securityAbsent ? 0 : 1)) return null;
  if (securityRows.length) {
    const cells = securityRows[0].split("|").map((cell) => cell.trim());
    if (cells.length !== 6 ||
        !/^✅ \*\*Completed\*\*(?: <relative-time datetime="[^"]+">[^<]+<\/relative-time>)?$/.test(cells[2]) ||
        cells[3] !== `\`${headSha.slice(0, 7)}\``) return null;
  }
  const visible = body.slice(match[0].length).replace(/\s*<details>\s*<summary>[^<]*About Codex in GitHub<\/summary>[\s\S]*<\/details>\s*$/, "");
  if (visible.split("\n").some((line) => line.trim() &&
      line.trim() !== "This comment shows the latest Codex review activity on this pull request." &&
      line.trim() !== "| Review | Status | Commit | Review trigger |" &&
      line.trim() !== "| --- | --- | --- | --- |" &&
      !rows.includes(line) && !/^\|[^|]*\*\*Security Review\*\*\s*\|/.test(line))) return null;
  return "pass";
}

export function codexCommentTime(comment) {
  return comment?.updated_at || comment?.created_at;
}

export function classifyCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  const body = String(comment?.body || "").trim();
  if (!/^[a-f0-9]{40}$/.test(headSha || "") ||
      !isTrustedReviewLogin(comment?.user?.login, "codex", config) || !isCodexReviewSignal(body)) return null;
  if (body.startsWith(summaryMarker)) {
    const result = parseStructuredCodexSummary(body, headSha, requestMarker);
    return result === "pass" && !codeCompletionTime(comment) ? null : result;
  }

  const receipt = body.startsWith(receiptMarker);
  if ((body.match(/codex-review-receipt:/g) || []).length !== (receipt ? 1 : 0) ||
      /codex-review-state:|codex-pull-request-review-summary/.test(body)) return "fail";
  const text = receipt ? body.slice(receiptMarker.length).trim() : body;
  // Only the known informational footer may follow the verdict and commit field.
  const content = text.replace(/\s*<details>\s*<summary>[^<]*About Codex in GitHub<\/summary>[\s\S]*<\/details>\s*$/, "");
  const match = content.match(/^Codex Review:\s*Did(?: not|n't|n’t) find any major issues\.(?: :rocket:| Keep it up!)?\s*(?:\*\*Reviewed commit:\*\* `([a-f0-9]{10}|[a-f0-9]{40})`)?\s*$/i);
  if (containsBlockingSeverity(body, "codex") || /found (?:some |major |any )?(?:issues|findings)|unresolved (?:issues|findings)|changes requested/i.test(content)) return "fail";
  if (!match) return null;
  if (match[1]) return (match[1] === headSha || match[1] === headSha.slice(0, 10)) ? "pass" : null;
  if (receipt) return null;
  // Preserve legacy summaries without a SHA only behind the trusted request/timeline checks.
  if (!requestMarker || requestMarker.agent !== "codex" || requestMarker.sha !== headSha) return null;
  const requestedAt = Date.parse(requestMarker.sourceCommentCreatedAt || requestMarker.requestedAt || requestMarker.commentCreatedAt || "");
  const createdAt = Date.parse(comment?.created_at || "");
  return Number.isFinite(requestedAt) && Number.isFinite(createdAt) && createdAt >= requestedAt ? "pass" : null;
}

export function isAcceptableCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  return classifyCodexSummaryComment(comment, headSha, requestMarker, config) === "pass";
}

export function latestCodexCommentResult(comments, headSha, requestMarker, config = {}) {
  const requestedAt = Date.parse(requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || "");
  if (comments.some((comment) => Date.parse(codexCommentTime(comment) || "") >= requestedAt && classifyCodexSummaryComment(comment, headSha, requestMarker, config) === "fail" &&
    /\bP[0-2]\b|found (?:some |major |any )?(?:issues|findings)|unresolved (?:issues|findings)|changes requested/i.test(comment.body || ""))) return "fail";
  const candidates = comments.filter((comment) =>
    isTrustedReviewLogin(comment?.user?.login, "codex", config) &&
    Date.parse(codexCommentTime(comment) || "") >= requestedAt
  ).map((comment) => {
    const state = typedCodexState(comment);
    if (state && validFindingCompanions(comment, state, headSha, config, true) &&
        Object.values(state).some((review) => review.commit_sha === headSha &&
        (review.has_any_findings || review.has_unresolved_findings)) &&
        !hasUnclearedStructuredFindings(comments, headSha, requestMarker, config)) return null;
    let result = classifyCodexSummaryComment(comment, headSha, requestMarker, config) || "pending";
    const time = verdictTime(comment, result, headSha, config);
    if (result === "pass" && Date.parse(time || "") < requestedAt) result = "pending";
    return { result, time };
  }).filter(Boolean).sort((a, b) => Math.floor(Date.parse(b.time) / 1000) - Math.floor(Date.parse(a.time) / 1000));
  if (!candidates.length) return null;
  const latestTime = candidates[0].time;
  const results = candidates.filter((entry) => Math.floor(Date.parse(entry.time) / 1000) === Math.floor(Date.parse(latestTime) / 1000)).map((entry) => entry.result);
  return results.includes("fail") ? "fail" : results.includes("pending") ? "pending" :
    results.includes("resolved_findings") ? "resolved_findings" : "pass";
}

export function hasHeadUpdateBetweenTimestamps(timeline = [], startCreatedAt, endCreatedAt) {
  const startTime = Date.parse(startCreatedAt || "");
  const endTime = Date.parse(endCreatedAt || "");
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) return true;
  return timeline.some((event) => {
    if (event.event !== "committed" && event.event !== "head_ref_force_pushed") return false;
    const eventTime = Date.parse(event.created_at || event.committer?.date || "");
    return Number.isFinite(eventTime) && eventTime > startTime && eventTime <= endTime;
  });
}

export function classifyCodexNativeReview(review, reviewComments = [], headSha, config = {}) {
  if (!review) return null;
  if (!headSha || review.commit_id !== headSha) return null;
  const login = normalizeLogin(review.user?.login);
  if (!isTrustedReviewLogin(login, "codex", config)) return null;
  if (containsBlockingSeverity(review.body, "codex")) return "fail";

  if (["CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) return "fail";
  if (!["APPROVED", "COMMENTED"].includes(review.state)) return null;

  const commentsForReview = reviewComments.filter((comment) =>
    comment.pull_request_review_id === review.id &&
    isTrustedReviewLogin(comment.user?.login, "codex", config)
  );
  if (commentsForReview.length === 0) return "pass";

  const priorities = commentsForReview.map((comment) => extractCodexPriority(comment.body));
  if (priorities.some((priority) => priority === null)) return "fail";
  return Math.min(...priorities) <= 2 ? "fail" : "pass";
}

export function latestCodexNativeReviewResult(reviews = [], reviewComments = [], headSha, config = {}) {
  const entries = reviews.map((review) => ({
    time: Date.parse(review.submitted_at || ""),
    result: classifyCodexNativeReview(review, reviewComments, headSha, config)
  })).filter((entry) => entry.result !== null);
  // An edited old review retains submitted_at. No newer approval may conceal a
  // current-head negative review or dismissal, regardless of that old timestamp.
  if (entries.some((entry) => entry.result === "fail")) return "fail";
  const dated = entries.filter((entry) => Number.isFinite(entry.time));
  if (!dated.length) return null;
  const latestTime = Math.max(...dated.map((entry) => entry.time));
  return dated.some((entry) => entry.time === latestTime && entry.result === "fail") ? "fail" : "pass";
}

export function isAcceptableNativeReview(review, agent, headSha, config = {}) {
  if (!review) return false;
  if (!headSha || review.commit_id !== headSha) return false;
  const login = normalizeLogin(review.user?.login);
  const body = review.body || "";

  if (agent === "codex") {
    return isTrustedReviewLogin(login, agent, config) &&
      review.state === "APPROVED" &&
      !containsBlockingSeverity(body, agent);
  }

  if (agent === "gemini") {
    return isTrustedReviewLogin(login, agent, config) && !containsBlockingSeverity(body, agent);
  }

  return false;
}

export function isAcceptableClaudeComment(comment, headSha, config = {}) {
  const body = comment?.body || "";
  const login = normalizeLogin(comment?.user?.login);
  if (!isTrustedReviewLogin(login, "claude", config)) return false;
  if (extractMarkerSha(body) !== headSha) return false;
  return extractClaudeOutcome(body) === "pass";
}


function typedCodexState(comment) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  const body = String(comment?.body || "").trim().replace(/<!--(?! codex-)[\s\S]*?-->/gi, "").trim();
  const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (.*?) -->\s*## Codex Review Summary(?:\n|$)/s);
  if (!match || codexProtocolMarkerCount(body) !== 2) return null;
  let state;
  try { state = JSON.parse(match[1]); } catch { return null; }
  const compact = match[1].replace(/"(?:\.|[^"\\])*"|\s+/g, (token) => token.startsWith('"') ? token : "");
  if (JSON.stringify(state) !== compact || !exactlyKeys(state, ["code_review", "security_review"])) return null;
  for (const value of Object.values(state)) {
    if (!exactlyKeys(value, ["commit_sha", "has_any_findings", "has_unresolved_findings", "status"])) return null;
    if (Object.values(value).every((entry) => entry === null)) continue;
    if (!/^[a-f0-9]{40}$/.test(value.commit_sha || "") || typeof value.has_any_findings !== "boolean" ||
        typeof value.has_unresolved_findings !== "boolean" ||
        !["completed", "in_progress", "queued", "pending", "failed", "cancelled"].includes(value.status) ||
        (!value.has_any_findings && value.has_unresolved_findings)) return null;
  }
  return state;
}

export function hasUnclearedStructuredFindings(comments, headSha, requestMarker, config = {}) {
  const evidence = comments.filter((comment) => isTrustedReviewLogin(comment.user?.login, "codex", config))
    .map((comment) => ({ comment, state: typedCodexState(comment) })).filter((entry) => entry.state);
  return evidence.some(({ comment, state }) => ["code_review", "security_review"].some((kind) => {
    const review = state[kind];
    if (review.commit_sha !== headSha || !(review.has_any_findings || review.has_unresolved_findings)) return false;
    const sectionTime = state[kind].status === "completed" ? sectionCompletionBucket(comment, kind, headSha) : NaN;
    const findingTime = Number.isFinite(sectionTime) ? sectionTime : Math.floor(Date.parse(codexCommentTime(comment) || "") / 1000);
    return !evidence.some((clean) => {
      const next = clean.state[kind];
      return next.commit_sha === headSha && next.status === "completed" && next.has_any_findings === false &&
        next.has_unresolved_findings === false && canonicalSectionClear(clean.comment, clean.state, kind, headSha, config) && sectionCompletionBucket(clean.comment, kind, headSha) > findingTime;
    });
  }));
}


function sectionCompletionBucket(comment, kind, headSha = null) {
  const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const rows = String(comment.body || "").split(/\r?\n/).filter((line) => line.startsWith("|") && line.includes(title));
  if (rows.length !== 1) return NaN;
  const cells = rows[0].split("|").map((cell) => cell.trim());
  if (cells.length !== 6 || (headSha && cells[3] !== "`" + headSha.slice(0, 7) + "`")) return NaN;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const updated = Date.parse(comment.updated_at || comment.created_at || "");
  return Number.isFinite(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(match[1]) &&
    new Date(value).toISOString().slice(0, 19) === match[1].slice(0, 19) &&
    value <= updated + 999 ? Math.floor(value / 1000) : NaN;
}


function canonicalSectionClear(comment, state, kind, headSha, config, validateCompanion = true) {
  const other = kind === "code_review" ? "security_review" : "code_review";
  const otherTitle = other === "security_review" ? "**Security Review**" : "**Code Review**";
  const otherRows = String(comment.body || "").split(/\r?\n/).filter((line) => line.startsWith("|") && line.includes(otherTitle));
  if (validateCompanion && (otherRows.length > 1 || (otherRows.length === 1 && !removableCompanionRow(comment, state[other], other, otherRows[0])))) return false;
  const target = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const absent = { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null };
  const body = String(comment.body || "").trim();
  const projected = body.replace(/<!-- codex-review-state:v1 .*? -->/s,
    "<!-- codex-review-state:v1 " + JSON.stringify({ code_review: state[kind], security_review: absent }) + " -->")
    .split(/\r?\n/).filter((line) => !line.startsWith("|") ||
      (!line.includes("**Code Review**") && !line.includes("**Security Review**")) || line.includes(target))
    .map((line) => line.includes(target) && kind === "security_review"
      ? line.replace(/(?:🛡️|🔒) \*\*Security Review\*\*/, "📝 **Code Review**") : line).join("\n");
  return classifyCodexSummaryComment({ ...comment, body: projected }, headSha,
    { requestedAt: "1970-01-01T00:00:00Z" }, config) === "pass";
}


// A resolved own-section finding cannot erase a newer invalid companion.
function validFindingCompanions(comment, state, headSha, config = {}, allowResolvedOwn = false) {
  return Object.entries(state).every(([kind, review]) => {
    const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
    if (Object.values(review).every((value) => value === null)) return !String(comment.body || "").split(/\r?\n/).some((line) => line.startsWith("|") && line.includes(title));
    if (review.status !== "completed") return false;
    if (allowResolvedOwn && review.commit_sha === headSha && (review.has_any_findings || review.has_unresolved_findings)) return true;
    return canonicalSectionClear(comment, { ...state, [kind]: { ...review, has_any_findings: false, has_unresolved_findings: false } }, kind, review.commit_sha, config, false);
  });
}


function hasIndentedCodexEnvelope(body) {
  const leading = String(body || "").match(/^(?:[ \t\r\n]*<!--[\s\S]*?-->)*[ \t\r\n]*/)?.[0] || "";
  return /^(?: {4,}|[ \t]*\t[ \t]*)<!-- codex-/im.test(leading);
}

function removableCompanionRow(comment, review, kind, row) {
  if (!review?.commit_sha) return false;
  const cells = row.split("|").map((cell) => cell.trim());
  if (cells.length !== 6 || cells[3] !== "`" + review.commit_sha.slice(0, 7) + "`" ||
      !["Manual request", "Automatic review"].includes(cells[4])) return false;
  if (review.status === "completed") return /^✅ \*\*Completed\*\* /.test(cells[2]) &&
    Number.isFinite(sectionCompletionBucket(comment, kind, review.commit_sha));
  if (!["running", "in_progress"].includes(review.status)) return false;
  const match = cells[2].match(/^🔄 \*\*Running\*\* since <relative-time datetime="([^"]+)">([^<]+)<\/relative-time>$/);
  const time = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  return Number.isFinite(time) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(match[1]) &&
    new Date(time).toISOString().slice(0, 19) === match[1].slice(0, 19) &&
    time <= Date.parse(comment.updated_at || comment.created_at || "") + 999;
}


function codexProtocolMarkerCount(body) {
  return (String(body || "").split(/\r?\n/).filter((line) =>
    !/^(?: {4,}|[ \t]*\t)/.test(line)).join("\n").match(/<!-- codex-/gi) || []).length;
}
