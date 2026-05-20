import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildAnalyzePrompt } from '../lib/prompts/analyze-prompt.js';
import { buildBasicAnalysisPrompt } from '../lib/prompts/basic-analysis-prompt.js';
import { buildSystemPrompt } from '../lib/prompts/system-prompt.js';
import { MODEL, pickModel } from '../lib/anthropic-config.js';

export const config = { runtime: 'edge' };

const MAX_MENU_CHARS = 550_000; // ~135K tokens — leaves room for reports, prompt, output

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY env var' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const menu = body?.menu;
  if (!menu) {
    return new Response(JSON.stringify({ error: 'Missing "menu" field in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];

  const slim = slimMenu(menu);
  // Pretty-print with 2-space indentation. Costs ~30-50% more tokens than
  // minified but is meaningfully easier for the model to scan — categories
  // and items have predictable line-based boundaries, modifiers nest
  // visibly, etc. This matches the shape a user would get when pasting the
  // JSON into claude.ai (where files are presented as readable text).
  const menuJson = JSON.stringify(slim, null, 2);

  if (menuJson.length > MAX_MENU_CHARS) {
    return new Response(JSON.stringify({
      error: `Menu JSON is ${(menuJson.length / 1000).toFixed(0)}KB after slimming, which exceeds the ${(MAX_MENU_CHARS / 1000)}KB budget. Try removing base64 image data or splitting the menu into sections.`
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  // Test-mode flag — when true, swap in the experimental single-pass prompt
  // instead of the structured analyze prompt. The frontend skips review +
  // validator in test mode.
  // Mode selection:
  //   'basic' → structural-only audit, no business analysis. Auto-selected
  //             when no supporting reports are attached (the model can't
  //             produce data-backed business analysis without source data).
  //   default → full multi-section audit prompt.
  const mode = String(body?.mode || '').toLowerCase();
  const useBasicAnalysis = mode === 'basic';
  const prompt = useBasicAnalysis
    ? buildBasicAnalysisPrompt({ menuJson })
    : buildAnalyzePrompt({ menuJson, location, reports });

  // Extended thinking — defaults to true; client passes false to opt out.
  const useExtendedThinking = body?.useExtendedThinking !== false;

  // Web search is now opt-in. Set ENABLE_WEB_SEARCH=true in Vercel env vars
  // to turn it on. Default OFF so all of the output token budget is spent on
  // JSON analysis rather than tool_use blocks.
  const enableWebSearch = process.env.ENABLE_WEB_SEARCH === 'true';

  // With web search off, give the model substantially more output budget for
  // the analysis itself. Thinking takes ~8K when on; everything else is text.
  const maxTokens = useExtendedThinking
    ? (enableWebSearch ? 32000 : 40000)
    : (enableWebSearch ? 24000 : 32000);

  // UI test toggle: when true, swap to Sonnet for this single run so the
  // user can compare cost/quality without changing the default.
  const useSonnet = body?.useSonnet === true;
  const payload = {
    model: pickModel(useSonnet),
    max_tokens: maxTokens,
    stream: true,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  };
  if (useExtendedThinking) {
    payload.thinking = { type: 'enabled', budget_tokens: 8000 };
  }
  if (enableWebSearch) {
    payload.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      },
    ];
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Anthropic API ${upstream.status}: ${errText}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
