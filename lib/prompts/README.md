# Prompts

Every prompt the Menu Analyzer sends to Claude lives in this directory. The
`api/*.js` route handlers are thin shells that import a prompt-builder, call
the Anthropic API, and stream the response back. To refine prompt wording,
edit the file here — no API logic in the way.

| File | What it does |
|---|---|
| `analyze-prompt.js` | First-pass audit prompt sent by `/api/analyze`. Returns a builder `buildAnalyzePrompt({ menuJson, location, reports })`. |
| `review-prompt.js` | Confirmatory-check prompt sent by `/api/review` after the first pass. Returns `buildReviewPrompt({ firstPassAudit, location, reports })`. |
| `test-prompt.js` | Experimental single-pass prompt used when the "Use Test Model Prompt" toggle is on in Step 2. `/api/analyze` swaps to it via the `useTestPrompt: true` flag in the request body; review + validator are skipped client-side. |
| `gold-standard.js` | The structural/depth reference used by the review pass. NOT a fact source — the reviewer is instructed not to copy restaurant-specific items/prices from it. |
| `slim-menu.js` | Sanitiser that strips base64 images, HTML tags, and oversize strings from the menu before serializing into the analyze prompt. |

## Workflow

1. Edit a file here.
2. Commit and push to `main`.
3. Vercel redeploys; new prompts take effect on the next request.

## Inspecting prompts in the browser

The "View prompts" link in the page footer opens a modal that calls
`/api/prompts` with the user's current inputs (uploaded menu, location,
supporting reports, last first-pass audit) and shows the exact analyze and
review prompts that would be sent to Claude. The modal also reports the
slim-menu reduction (original KB → slimmed KB), model id, and `max_tokens`.

`/api/prompts` is non-streaming and never calls Anthropic — it just runs the
builders in this directory and returns the strings as JSON. Useful when
iterating on wording.

## Where to add new prompts

If you add a third pass (e.g. a separate formatting pass), create a new
`*-prompt.js` builder here, then add a thin handler under `api/` that imports
it and posts to Anthropic. Keep all wording in `lib/prompts/`.
