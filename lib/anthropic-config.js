// Single source of truth for the Anthropic model ids used by every endpoint.
//
// Edge functions (analyze, review, format-report, format-notion, prompts)
// import either MODEL directly or pickModel(useSonnet) — the picker lets
// the UI flip individual runs onto the cheaper Sonnet model for A/B
// comparison without redeploying.
//
// Pricing reminder (very rough, as of early 2026):
//   Sonnet 4.x   ≈  $3 in / $15 out per million tokens
//   Opus 4.x     ≈ $15 in / $75 out per million tokens  (~5× Sonnet)
// An audit run uses ~50-150K input tokens and ~10-40K output tokens;
// multiply across analyze + review + format passes for the total.

export const MODEL        = 'claude-opus-4-6';     // default for production traffic
export const SONNET_MODEL = 'claude-sonnet-4-6';   // opt-in via UI toggle for cost-comparison

// Pick a model based on a UI flag. Truthy → Sonnet, otherwise → the default.
// Used by all endpoints so the toggle works end-to-end with no per-route logic.
export function pickModel(useSonnet) {
  return useSonnet ? SONNET_MODEL : MODEL;
}
