import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildAnalyzePrompt } from '../lib/prompts/analyze-prompt.js';
import { buildReviewPrompt } from '../lib/prompts/review-prompt.js';

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

  let analyzePrompt = null;
  let slimStats = null;

  if (menu) {
    const slim = slimMenu(menu);
    const slimmed = JSON.stringify(slim);
    const original = JSON.stringify(menu);
    slimStats = {
      original_chars: original.length,
      slimmed_chars: slimmed.length,
      reduction_pct: original.length ? Math.round((1 - slimmed.length / original.length) * 1000) / 10 : 0,
    };
    analyzePrompt = buildAnalyzePrompt({ menuJson: slimmed, location, reports });
  } else {
    analyzePrompt = buildAnalyzePrompt({
      menuJson: '[upload a menu JSON to see this prompt populated]',
      location,
      reports,
    });
  }

  const reviewPrompt = buildReviewPrompt({ firstPassAudit, location, reports });

  return json({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16000,
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
