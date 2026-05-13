import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildAnalyzePrompt } from '../lib/prompts/analyze-prompt.js';
import { buildReviewPrompt } from '../lib/prompts/review-prompt.js';
import { buildBasicAnalysisPrompt } from '../lib/prompts/basic-analysis-prompt.js';
import { MODEL } from '../lib/anthropic-config.js';

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

  const mode = String(body?.mode || '').toLowerCase();
  const useBasicAnalysis = mode === 'basic';

  let analyzePrompt = null;
  let slimStats = null;
  let slimmedJson = '[upload a menu JSON to see this prompt populated]';

  if (menu) {
    const slim = slimMenu(menu);
    // Pretty-print to match what /api/analyze actually sends to Claude.
    slimmedJson = JSON.stringify(slim, null, 2);
    const original = JSON.stringify(menu);
    slimStats = {
      original_chars: original.length,
      slimmed_chars: slimmedJson.length,
      reduction_pct: original.length ? Math.round((1 - slimmedJson.length / original.length) * 1000) / 10 : 0,
    };
  }

  if (useBasicAnalysis) {
    analyzePrompt = buildBasicAnalysisPrompt({ menuJson: slimmedJson });
  } else {
    analyzePrompt = buildAnalyzePrompt({ menuJson: slimmedJson, location, reports });
  }

  // In basic mode the review pass is skipped, so the modal shows a notice
  // instead of the review prompt.
  const reviewPrompt = useBasicAnalysis
    ? '(Review pass is skipped in Basic Analysis mode — basic mode is single-pass by design.)'
    : buildReviewPrompt({ firstPassAudit, location, reports });

  // Reflect the thinking + web-search settings so the modal stats can show
  // them. max_tokens here mirrors the analyze endpoint's actual logic.
  const useExtendedThinking = body?.useExtendedThinking !== false;
  const webSearchOn = process.env.ENABLE_WEB_SEARCH === 'true';
  const maxTokens = useExtendedThinking
    ? (webSearchOn ? 32000 : 40000)
    : (webSearchOn ? 24000 : 32000);

  return json({
    model: MODEL,
    max_tokens: maxTokens,
    extended_thinking: useExtendedThinking,
    thinking_budget_tokens: useExtendedThinking ? 8000 : 0,
    web_search: webSearchOn,
    basic_mode: useBasicAnalysis,
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
