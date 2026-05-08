// First-pass audit prompt.
//
// Used by /api/analyze. Produces a comprehensive consultant-style audit of
// the menu JSON. Output begins with a JSON metrics block between
// <<<JSON ... JSON>>> markers, followed by GitHub-flavoured Markdown.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
// Three pieces of dynamic content are injected into the prompt below.
// In the source they appear as ${...} substitutions; in the rendered
// prompt (visible via the "View prompts" modal) each is wrapped with
// matching BEGIN / END markers so it's obvious where dynamic content
// starts and ends.
//
//   ${menuJson}
//      The slimmed menu JSON, serialised compactly. Slimming is done
//      in lib/prompts/slim-menu.js before this builder is called.
//
//   ${locationBlock}
//      Either an empty string (no location supplied) or a short block
//      naming the restaurant address. When present, also unlocks the
//      §6 Revenue & Competitive Strategy section.
//
//   ${reportsBlock}
//      Either an empty string or the verbatim text contents of every
//      supporting report the user uploaded — capped at 60,000 chars
//      per file.

const FENCE = '────────────────────────────────────────────────────────────────';

export function buildAnalyzePrompt({ menuJson, location, reports }) {
  // ── PLACEHOLDER #3: supporting-report contents ─────────────────────────
  const reportsBlock = reports.length
    ? `\n\n▼ BEGIN SUPPORTING BUSINESS REPORTS (${reports.length} file${reports.length === 1 ? '' : 's'})\n${FENCE}\n` +
      `Use these as additional context when forming recommendations. Cite figures from them when relevant.\n\n` +
      reports
        .map(r =>
          `=== ${String(r?.name || 'report').slice(0, 120)} ===\n` +
          `${String(r?.content || '').slice(0, 60000)}`)
        .join('\n\n') +
      `\n${FENCE}\n▲ END SUPPORTING BUSINESS REPORTS`
    : '';

  // ── PLACEHOLDER #2: restaurant location ────────────────────────────────
  const locationBlock = location
    ? `\n\n▼ BEGIN RESTAURANT LOCATION\n${FENCE}\n${location}\n${FENCE}\n▲ END RESTAURANT LOCATION\n(When producing the competitive analysis, take a 45-mile radius around this location into consideration.)`
    : '';

  return `You are a high-value, sought-after menu consultant who works on increasing revenue, aesthetics, clarity, and website ranking of restaurant menus.

Analyse the attached menu JSON${reports.length ? ' along with the supporting business reports below' : ''} and produce a comprehensive audit modelled on a professional consulting deliverable.${locationBlock}

OUTPUT FORMAT — strictly:
1) FIRST output a single JSON metrics block on its own lines, between the literal markers <<<JSON and JSON>>>, in EXACTLY this shape (integers only, no extra keys):
<<<JSON
{"items":0,"categories":0,"item_images":0,"category_images":0,"upsells":0}
JSON>>>
2) THEN output the rest of the audit as GitHub-flavoured Markdown using the section structure below. Use real Markdown tables (with header row + separator) for every tabular section. Use ## for top-level sections, ### for sub-sections. Use **bold** for emphasis on category names, item names, and key counts. Keep prose tight and consultant-grade.

REQUIRED SECTIONS:

## 1. Headline Counts
Markdown table with columns: Metric | Count. Include: Total categories (split enabled/disabled, naming the disabled), Total items (split enabled/disabled), Modifiers defined in the menu, Images at category level, Images at item level (with percentage), Items with modifier links attached, True merchandising upsells configured.

### Food vs Drink split
Markdown table: Section | Categories | Items | Items with images | Coverage. One row for Food, one for Drinks.

## 2. Image Coverage by Category
Markdown table: Category | Items | Images | Coverage. List every category, sorted by coverage descending. Mark 100% with ✓ and 0% with ✗.

## 3. The "Upsells" Finding
Cross-reference each item's modifier IDs against the modifier definitions. State how many items have modifier links and how many of those modifiers are *true cross-sell upsells* vs *variant pickers*. List the variant-picker groups as bullets (e.g. "Choose Size — water, wine, spirits — N items"). Conclude with whether any true cross-sells exist.

## 4. Items in the Wrong Category
Markdown table: Item | Currently in | Should be in | Why. Identify every miscategorised item with reasoning. Flag duplicates across categories.

## 5. Other Data-Quality Issues
### Typos that will appear on the live menu and receipts
Bullet list of misspellings found, formatted "current" → "should be".
### Other issues
Bullet list: items missing descriptions (with count and notable examples), duplicate item names across categories, disabled categories still polluting the JSON, image-coverage extremes.

## Recommendations to Make the Menu More Navigable

### A. Restructure into cleaner categories
Propose a two-tier structure (FOOD parent group, DRINKS parent group). Use a Markdown table per group: Category | Notes. Note which categories are NEW, which are merges, and which are renamed. Conclude with how many lines this collapses the navigator to.

### B. Image coverage — fix the gaps in priority order
Bullet list ordered by impact. Quote the current coverage % and explain the rationale (e.g. ordering without a picture cuts conversion by ~30%).

### C. Configure real upsells (currently zero or near-zero)
Markdown table: When customer adds… | Prompt | Type. At least 5 rows. Include the rationale paragraph noting AOV uplift potential.

### D. Fix every data-quality issue in §5
Bullet list of concrete 30-minute tasks.

### E. Promote signature items currently buried
Bullet list — for each, name, price (£), where it currently sits, and where it should sit, with a one-sentence justification.

### F. Add missing items the cuisine should include
Bullet list of items typical of the cuisine that are missing or under-served.${location ? `

## 6. Revenue & Competitive Strategy (45-mile radius)
Detailed competitive comparison around the provided location. Cover:
- What competing restaurants in the radius are doing that makes them stand out
- Ideal item placement for greater visibility of high-selling items
- High-value revenue-generating upsells derived from this menu
- Meal deals, offers, combos to bring traffic in low-traffic days/hours
- Deals to attract repeat customers
For every suggestion, include a brief reason and the analysis behind it.` : ''}

## Net Summary
2-3 sentences. The single most impactful changes — what will actually move revenue.

End the audit with the literal line: *— End of audit —*

▼ BEGIN MENU JSON
${FENCE}
(pre-processed: HTML stripped, binary blobs replaced with [binary], very long strings truncated)
\`\`\`json
${menuJson}
\`\`\`
${FENCE}
▲ END MENU JSON${reportsBlock}`;
}
