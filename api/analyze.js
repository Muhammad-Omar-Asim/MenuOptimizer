import { slimMenu } from '../lib/prompts/slim-menu.js';
import { buildAnalyzePrompt } from '../lib/prompts/analyze-prompt.js';
import { buildTestPrompt } from '../lib/prompts/test-prompt.js';

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
  const menuJson = JSON.stringify(slim);

  if (menuJson.length > MAX_MENU_CHARS) {
    return new Response(JSON.stringify({
      error: `Menu JSON is ${(menuJson.length / 1000).toFixed(0)}KB after slimming, which exceeds the ${(MAX_MENU_CHARS / 1000)}KB budget. Try removing base64 image data or splitting the menu into sections.`
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  // Test-mode flag — when true, swap in the experimental single-pass prompt
  // instead of the structured analyze prompt. The frontend skips review +
  // validator in test mode.
  const useTestPrompt = body?.useTestPrompt === true;
  const prompt = useTestPrompt
    ? buildTestPrompt({ menuJson, location, reports })
    : buildAnalyzePrompt({ menuJson, location, reports });

  // Extended thinking — defaults to true; client passes false to opt out.
  const useExtendedThinking = body?.useExtendedThinking !== false;

  const payload = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: useExtendedThinking ? 24000 : 16000,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useExtendedThinking) {
    payload.thinking = { type: 'enabled', budget_tokens: 8000 };
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
