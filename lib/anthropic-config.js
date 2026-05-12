// Single source of truth for the Anthropic model id used by every endpoint.
//
// All four edge functions (analyze, review, format-report, prompts) import
// MODEL from here. To swap models, edit this one line and redeploy.
//
// Pricing reminder (very rough, as of early 2026):
//   Sonnet 4.5   ≈  $3 in / $15 out per million tokens
//   Opus 4.x     ≈ $15 in / $75 out per million tokens  (~5× Sonnet)
// An audit run uses ~50-150K input tokens and ~10-40K output tokens; multiply
// across analyze + review + format-report passes for the total.

export const MODEL = 'claude-opus-4-6';
