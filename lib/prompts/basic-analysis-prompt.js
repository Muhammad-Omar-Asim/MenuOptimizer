// Basic Analysis prompt.
//
// Used by /api/analyze when the request body has mode: 'basic'. Triggered
// by the "Basic Analysis" button — auto-suggested when the user uploads a
// menu JSON without supporting business reports.
//
// The prompt below is the operator's spec verbatim. No additional scaffolding
// has been layered on top — no enforced section list, no metrics-block
// requirement, no format rules beyond what the prompt itself asks for.
// The on-screen metric tiles will read "—" when this mode runs because the
// prompt does not request a metrics block.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
//
//   ${menuJson}   the slimmed menu JSON, pretty-printed
//
// To refine the wording: edit the literal text below.

const FENCE = '────────────────────────────────────────────────────────────────';

export function buildBasicAnalysisPrompt({ menuJson }) {
  return `Analyze the following data as a high-value sought-after menu consultant who works on increasing revenue, aesthetics, clarity, and website ranking of the menu. The idea is to present it to the client to highlight where their menu is lacking and has gaps. The report should be convincing and driven by the data present in the JSON attached. After they are done and have given their data-backed analysis, the suggestions made are guaranteed to increase overall revenue and visibility for the client.

Analyze the JSON attached and give a detailed count of the number of items, the number of categories, the number of images at the item level, and the number of images at the category level. Number of upsells attached to items. Also the number of descriptions for the category and items.

This data should also be provided in terms of percentages and total coverage of items per category.

Also, identify which items should not ideally be in the category they are placed in.

After the analysis, give a recommendation of what can be improved in the menu to make it more functional in terms of ease of navigation for the client.

▼ BEGIN MENU JSON
${FENCE}
\`\`\`json
${menuJson}
\`\`\`
${FENCE}
▲ END MENU JSON`;
}
