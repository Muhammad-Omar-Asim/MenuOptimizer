// Test-mode prompt — experimental single-pass consultant prompt.
//
// Used by /api/analyze when the request body has useTestPrompt: true.
// Bypasses the normal multi-section analyze prompt and the confirmatory
// review pass entirely. Output structure is at the model's discretion —
// no enforced section list, no metrics-block requirement, no completeness
// rule. The frontend treats test mode as opt-in experimentation and
// skips the post-stream validator.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
//
//   ${menuJson}        slimmed menu JSON
//   ${finalLocation}   user-supplied location, falls back to Cave default
//   ${reportsBlock}    verbatim text of attached supporting reports, or empty
//
// To refine the wording: edit the literal text below.

const FENCE = '────────────────────────────────────────────────────────────────';
const DEFAULT_LOCATION = '109 Saint Margarets Road, Twickenham TW1 2LH';
const DEFAULT_WEBSITE  = 'https://www.thecave-restaurant.co.uk/';

export function buildTestPrompt({ menuJson, location, reports }) {
  const finalLocation = (location && location.trim()) || DEFAULT_LOCATION;

  const reportsBlock = reports && reports.length
    ? `\n\n▼ BEGIN SUPPORTING BUSINESS REPORTS (${reports.length} file${reports.length === 1 ? '' : 's'})\n` +
      FENCE + '\n' +
      reports
        .map(r =>
          `=== ${String(r?.name || 'report').slice(0, 120)} ===\n` +
          `${String(r?.content || '').slice(0, 60000)}`)
        .join('\n\n') +
      '\n' + FENCE + '\n' +
      '▲ END SUPPORTING BUSINESS REPORTS'
    : '';

  return `Analyze the following data as a high-value sought-after menu consultant who works on increasing revenue, aesthetics, clarity, and website ranking of the menu. And after they are done and have given their data backed analysis the suggestions made are guaranteed to increase overall revenue and visibility for the client. You will be provided with website links, JSON of the menu, and relevant reports of our restaurant. This will be your source data to work on and to analyze. Analyze the JSON attached and give a detailed count of the number of items, the number of categories, the number of images at item level, number of images at the category level. Number of upsells attached to items. Also, identify which items should not ideally be in the category they are placed in Identify and list down all the major gaps in the menu and where it is lacking in terms of combos, deals, upsells, visual appeal, and wrong placement. Give advanced data on ideal item placement for greater visibility for high-selling items and suggest high-value revenue-generating upsells derived from the data shared.  Create and suggest meal deals, offers, and combos that will bring traffic in days and hours where there is less traffic in the restaurant.  Create deals to attract repeat customers as well. Take a 5-mile radius into consideration according to the location provided and give a detailed comparison of what other restaurants are doing that makes them stand out more.  Give an insight into consumer behavior based on location and the 5-mile radius. Make bullet point suggestion on deal names, what sells most in the area in terms of food, how experimental or conventional people are in term of restaurants or food consumption and what kind of deal, or upsell could function better for our restaurant. Each suggestion should have  reasons mentioned in bullets on how you came to this conclusion.
The Goal it to make the menu optimal in terms of both revenue and customer experience. The ideal output should be detailed, data backed, through, and should be given in a refined, polished PDF report format that is easy to understand and grasp.
From the data, create a proper report, that has neat tables, is detailed, has polished formatting, fonts, colours, heading and sub heading.
LOCATION: ${finalLocation}
WEBSITE: ${DEFAULT_WEBSITE}

▼ BEGIN MENU JSON
${FENCE}
\`\`\`json
${menuJson}
\`\`\`
${FENCE}
▲ END MENU JSON${reportsBlock}

Now produce the full audit.`;
}
