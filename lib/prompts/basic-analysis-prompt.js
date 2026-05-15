// Basic Analysis prompt.
//
// Used by /api/analyze when the request body has mode: 'basic'. Triggered
// by the "Basic Analysis" button — auto-suggested when the user uploads a
// menu JSON without supporting business reports.
//
// The prompt below is the operator's spec, verbatim. Do not alter the
// wording. The only thing appended is the menu JSON itself at the end,
// since the prompt refers to "the attached JSON menu data".
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
  return `You are an elite menu growth consultant specializing in restaurant revenue optimization, menu engineering, customer navigation behavior, digital conversion, SEO visibility, and visual merchandising for online ordering platforms.

Your task is to analyze the attached JSON menu data and produce a professional, data-driven consultation report for the restaurant client. The objective of the report is to clearly demonstrate gaps, weaknesses, missed revenue opportunities, and optimization potential within the menu structure.

The tone should be authoritative, consultative, persuasive, and commercially focused. Every insight should be supported by the data present in the JSON.

The report must emphasize how the recommended improvements can increase:

Required analysis:

1. Menu Structure Analysis
   Provide:

* Total number of categories
* Total number of items
* Total number of item-level images
* Total number of category-level images
* Total number of item descriptions
* Total number of category descriptions
* Total number of items with upsells attached
* Total number of upsell groups

2. Coverage Analysis
   For every category, provide:

* Number of items in the category
* Percentage of total menu items represented by the category
* Number and percentage of items with images
* Number and percentage of items with descriptions
* Number and percentage of items with upsells
* Number and percentage of items missing images
* Number and percentage of items missing descriptions
* Number and percentage of items without upsells

3. Visual Merchandising Analysis
   Identify:

* Categories lacking visual consistency
* Categories with poor image coverage
* High-value items missing images
* Categories where image optimization could improve conversion
* Areas where category banners or category images are missing

4. Revenue Optimization Analysis
   Identify:

* Missed upsell opportunities
* Categories with weak upsell attachment rates
* Items that should have modifiers or add-ons
* Categories with too many low-conversion items
* Categories that may overwhelm customer navigation
* Areas where bundling or combo creation would improve basket size

5. Menu Navigation and UX Analysis
   Evaluate:

* Whether category naming is intuitive
* Whether categories are overloaded or too sparse
* Whether menu flow is customer-friendly
* Whether item placement supports conversion
* Whether the menu structure encourages exploration and repeat purchases

6. Misclassification Detection
   Identify items that do not logically belong in their current category.
   For each misclassified item:

* Mention the current category
* Suggest the ideal category
* Explain why the current placement may reduce discoverability or conversion

7. SEO and Discoverability Analysis
   Identify:

* Categories or items with weak naming conventions
* Missing descriptive content affecting search ranking
* Opportunities to improve item discoverability
* Opportunities to improve keyword relevance and customer clarity

8. Final Strategic Recommendations
   Provide a prioritized action plan divided into:

* High impact quick wins
* Medium-term improvements
* Long-term optimization opportunities

The recommendations must feel commercially valuable and persuasive enough for a restaurant client presentation.

Formatting requirements:

* Do NOT use the pipe character anywhere in the output
* Use headings, bullet points, numbered lists, and short paragraphs only. Headings should be aligned with the above points given such as 1,2, 3
* Keep the report professional and presentation-ready.
* Include percentages wherever possible, especially for image coverage.
* Make observations concise but impactful
* The table should follow alternate color formatting, to differentiate between rows.


Important:
Do not invent data that is not present in the JSON. Base all findings strictly on the provided dataset. If a menu is already strong in some points, such as point 1 or 2, then mention that area does not need improvement and why, instead of skipping any point.

▼ BEGIN MENU JSON
${FENCE}
\`\`\`json
${menuJson}
\`\`\`
${FENCE}
▲ END MENU JSON`;
}
