import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildReviewPrompt } from '../lib/prompts/review-prompt.js';
import { buildSystemPrompt } from '../lib/prompts/system-prompt.js';
import { MODEL, pickModel } from '../lib/anthropic-config.js';

export const config = { runtime: 'edge' };

// Confirmatory review pass. Runs after /api/analyze when the user has the
// "Run confirmatory check" toggle on. Re-produces the audit with the
// first-pass output supplied as reference, so the model can verify the
// figures, fill gaps, and tighten language rather than starting blind.

// See api/analyze.js for the rationale on this value. Kept in sync.
const MAX_MENU_CHARS = 2_000_000;

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
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const menu = body?.menu;
  if (!menu) {
    return new Response(JSON.stringify({ error: 'Missing "menu" field in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const firstPassAudit = String(body?.firstPassAudit || '').trim();
  if (!firstPassAudit) {
    return new Response(JSON.stringify({ error: 'Missing firstPassAudit' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];

  // Slim + pretty-print the menu the same way analyze does, so the review
  // model sees the same data shape it processed in the first pass.
  const slim = slimMenu(menu);
  const menuJson = JSON.stringify(slim, null, 2);
  if (menuJson.length > MAX_MENU_CHARS) {
    return new Response(JSON.stringify({
      error: `Menu JSON is ${(menuJson.length / 1000).toFixed(0)}KB after slimming, exceeds the ${(MAX_MENU_CHARS / 1000)}KB server-side budget. Menus this large will also exceed Anthropic's 200K-token context window — split the menu or switch to a long-context model variant.`,
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  const prompt = buildReviewPrompt({ menuJson, location, reports, firstPassAudit });

  const useExtendedThinking = body?.useExtendedThinking !== false;
  const enableWebSearch = process.env.ENABLE_WEB_SEARCH === 'true';
  const maxTokens = useExtendedThinking
    ? (enableWebSearch ? 32000 : 40000)
    : (enableWebSearch ? 24000 : 32000);

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
    payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
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
