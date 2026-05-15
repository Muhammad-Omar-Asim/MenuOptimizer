// Basic Analysis prompt.
//
// Used by /api/analyze when the request body has mode: 'basic'. Triggered
// by the "Basic Analysis" button — auto-suggested when the user uploads a
// menu JSON without supporting business reports.
//
// The prompt below is the operator's spec, verbatim. Do not alter the
// wording. The only things appended are:
//   - the provided location (because the prompt asks for "a 5-mile radius
//     from the provided location")
//   - the menu JSON itself (because the prompt refers to "the attached
//     JSON")
//
// The previous version of this prompt is preserved verbatim in
// ./old-basic-analysis-prompt.js in case we need to roll back.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
//
//   ${menuJson}   the slimmed menu JSON, pretty-printed
//   ${location}   optional location string (city / address / region) used
//                 by the 5-mile radius competitor + consumer-behavior asks
//
// To refine the wording: edit the literal text below.

const FENCE = '────────────────────────────────────────────────────────────────';

export function buildBasicAnalysisPrompt({ menuJson, location }) {
  const loc = (location || '').toString().trim();
  const locationBlock = loc
    ? `Location: ${loc}\n\n`
    : `Location: (not provided — note this in the report and explain that the 5-mile-radius comparison and consumer-behavior insights cannot be tailored without a location)\n\n`;

  return `Your analysis must be detailed, data-backed, thorough, and oriented toward improving both revenue and customer experience. Present the final output as a polished PDF-style report with clear headings and subheadings, neat tables, refined formatting, and professional use of fonts and colors.
Required analysis and recommendations:
- Analyze the attached JSON and report:
- Total number of items
- Total number of categories
- Number of item-level images
- Number of category-level images
- Number of upsells attached to items
- Identify items that are placed in unsuitable categories.
- List all major menu gaps, including where the menu is lacking in:
- Combos
- Deals
- Upsells
- Visual appeal
- Correct item placement
- Provide advanced recommendations for ideal item placement to improve visibility of high-selling items.
- Suggest high-value, revenue-generating upsells derived from the shared data.
- Create and suggest meal deals, offers, and combos designed to increase traffic during lower-traffic days and hours.
- Create deals designed to attract repeat customers.
- Using a 5-mile radius from the provided location, give a detailed comparison of what competing restaurants are doing that helps them stand out.
- Provide insights into consumer behavior based on the location and the 5-mile radius.
- Give bullet-point suggestions covering:
- Deal names
- What food sells most in the area
- Whether customers in the area are more experimental or conventional in their restaurant and food choices
- Which deals or upsells are most likely to work well for this restaurant
- For every suggestion, include bullet-point reasons explaining how you reached that conclusion.
Output requirements:
- Structure the response as a proper report.
- Include neat tables where useful.
- Use polished formatting with clear section headings and subheadings.
- Ensure the report is easy to understand and easy to scan.

${locationBlock}▼ BEGIN MENU JSON
${FENCE}
\`\`\`json
${menuJson}
\`\`\`
${FENCE}
▲ END MENU JSON`;
}
