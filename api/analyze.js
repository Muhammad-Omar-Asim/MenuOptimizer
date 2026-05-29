import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildAnalyzePrompt } from '../lib/prompts/analyze-prompt.js';
import { buildBasicAnalysisPrompt } from '../lib/prompts/basic-analysis-prompt.js';
import { buildSystemPrompt } from '../lib/prompts/system-prompt.js';
import { MODEL, pickModelForRun } from '../lib/anthropic-config.js';

export const config = { runtime: 'edge' };

// Slimmed-menu size budget. 5MB ≈ ~1.25M input tokens at ~4 chars/token.
//
// We pair this with the 1M-context auto-promotion in pickModelForRun:
// menus over 500KB are silently routed to Sonnet with the 1M-context beta
// header, which fits up to ~4MB of JSON input. The 5MB cap here gives the
// upstream API just enough headroom to return a precise "prompt too long"
// error for menus that genuinely don't fit, instead of us pre-rejecting
// at a lower bound.
//
// If a menu still bounces off Anthropic at 1M context, the realistic next
// move is targeted slimming (find which fields are still bloating it) or
// chunked-by-category analysis.
const MAX_MENU_CHARS = 5_000_000;

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
      error: `Menu JSON is ${(menuJson.length / 1000).toFixed(0)}KB after slimming, which exceeds the ${(MAX_MENU_CHARS / 1000)}KB server-side budget. ` +
             `Even the 1M-token context window tops out at ~4MB of JSON. Try splitting the menu into sections or remove unused / disabled items before uploading.`
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
  // Auto-promote to the 1M-context Sonnet variant when:
  //   (a) the client confirmed it via the size-warning modal
  //       (body.forceLongContext === true), or
  //   (b) the slimmed menu turns out to exceed the threshold anyway
  //       (safety net for the case the client didn't ask).
  // Surfaced to the client via the X-Long-Context response header so
  // the UI can show a "switched to Sonnet 1M" disclaimer banner.
  const forceLongContext = body?.forceLongContext === true;
  const selection = pickModelForRun({
    menuChars: menuJson.length,
    useSonnet,
    forceLongContext,
  });
  const payload = {
    model: selection.model,
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

  const anthropicHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (selection.beta) anthropicHeaders['anthropic-beta'] = selection.beta;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders,
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
      'X-Long-Context': selection.longContext ? '1' : '0',
      'X-Model-Used': selection.model,
    },
  });
}
