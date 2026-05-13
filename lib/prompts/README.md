# Prompts

Every prompt the Menu Analyzer sends to Claude lives in this directory. The
`api/*.js` route handlers are thin shells that import a prompt-builder, call
the Anthropic API, and stream the response back. To refine prompt wording,
edit the file here — no API logic in the way.

| File | What it does |
|---|---|
| `analyze-prompt.js` | The single-pass audit prompt sent by `/api/analyze` on Full Optimize runs. Returns a builder `buildAnalyzePrompt({ menuJson, location, reports })`. (The previous confirmatory-check / review pass has been retired.) |
| `format-report-prompt.js` | Third-pass prompt sent by `/api/format-report` when the user clicks **Create PDF**. Reformats the audit into a client-ready report with deep `###` sub-sectioning, prose-to-table conversion, and strict GFM rules. Returns `buildFormatReportPrompt({ auditText, location, reports })`. |
| `basic-analysis-prompt.js` | Single-pass structural audit prompt. `/api/analyze` swaps to it when the request body has `mode: 'basic'` — triggered by the **Basic Analysis** button, which is auto-suggested when the user uploads a menu JSON without supporting reports. Covers only the eleven structural points (total counts, image/description coverage, category-name quality, miscategorisation, item-name quality, upsell attachment) — never produces business-side reasoning. |
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
