import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildAnalyzePrompt } from '../lib/prompts/analyze-prompt.js';
import { buildReviewPrompt } from '../lib/prompts/review-prompt.js';
import { buildTestPrompt } from '../lib/prompts/test-prompt.js';

export const config = { runtime: 'edge' };

// Inspect-only endpoint. Returns the exact prompts the analyze/review pipeline
// would send for the supplied inputs — without calling Anthropic. Used by the
// "View prompts" modal so users can see (and copy) the wording, with their
// current menu, location, and reports already substituted in.

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. POST { menu, location, supportingReports?, firstPassAudit? }' }, 405);
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: 'Request body must be JSON' }, 400); }

  const menu = body?.menu;
  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];
  const firstPassAudit = String(body?.firstPassAudit || '').trim() ||
    '(no first-pass audit yet — run an analysis first to see the review prompt populated)';

  const useTestPrompt = body?.useTestPrompt === true;

  let analyzePrompt = null;
  let slimStats = null;
  let slimmedJson = '[upload a menu JSON to see this prompt populated]';

  if (menu) {
    const slim = slimMenu(menu);
    slimmedJson = JSON.stringify(slim);
    const original = JSON.stringify(menu);
    slimStats = {
      original_chars: original.length,
      slimmed_chars: slimmedJson.length,
      reduction_pct: original.length ? Math.round((1 - slimmedJson.length / original.length) * 1000) / 10 : 0,
    };
  }

  if (useTestPrompt) {
    analyzePrompt = buildTestPrompt({ menuJson: slimmedJson, location, reports });
  } else {
    analyzePrompt = buildAnalyzePrompt({ menuJson: slimmedJson, location, reports });
  }

  // In test mode the review pass is skipped, so the modal shows a notice
  // instead of the review prompt.
  const reviewPrompt = useTestPrompt
    ? '(Review pass is skipped in test mode. Toggle "Use Test Model Prompt" off in Step 2 to see the standard confirmatory-check prompt.)'
    : buildReviewPrompt({ firstPassAudit, location, reports });

  // Reflect the thinking setting back so the modal stats can show on/off
  // and the correct max_tokens / thinking budget.
  const useExtendedThinking = body?.useExtendedThinking !== false;

  return json({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: useExtendedThinking ? 24000 : 16000,
    extended_thinking: useExtendedThinking,
    thinking_budget_tokens: useExtendedThinking ? 8000 : 0,
    web_search: process.env.DISABLE_WEB_SEARCH !== 'true',
    test_mode: useTestPrompt,
    location,
    reports_count: reports.length,
    slim_stats: slimStats,
    analyze: analyzePrompt,
    review: reviewPrompt,
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
