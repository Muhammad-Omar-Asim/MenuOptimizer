# Prompts

Every prompt the Menu Analyzer sends to Claude lives in this directory. The
`api/*.js` route handlers are thin shells that import a prompt-builder, call
the Anthropic API, and stream the response back. To refine prompt wording,
edit the file here — no API logic in the way.

| File | What it does |
|---|---|
| `analyze-prompt.js` | First-pass audit prompt sent by `/api/analyze`. Returns a builder `buildAnalyzePrompt({ menuJson, location, reports })`. |
| `review-prompt.js` | Confirmatory-check prompt sent by `/api/review` after the first pass. Returns `buildReviewPrompt({ firstPassAudit, location, reports })`. |
| `gold-standard.js` | The structural/depth reference used by the review pass. NOT a fact source — the reviewer is instructed not to copy restaurant-specific items/prices from it. |
| `slim-menu.js` | Sanitiser that strips base64 images, HTML tags, and oversize strings from the menu before serializing into the analyze prompt. |

## Workflow

1. Edit a file here.
2. Commit and push to `main`.
3. Vercel redeploys; new prompts take effect on the next request.

## Where to add new prompts

If you add a third pass (e.g. a separate formatting pass), create a new
`*-prompt.js` builder here, then add a thin handler under `api/` that imports
it and posts to Anthropic. Keep all wording in `lib/prompts/`.
