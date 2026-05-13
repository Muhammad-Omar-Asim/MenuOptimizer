// Confirmatory review prompt.
//
// Used by /api/review. Takes the first-pass audit, performs a confirmatory
// check against a defined depth standard, and outputs a single COMPLETE,
// REVISED audit.
//
// ──────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS
// ──────────────────────────────────────────────────────────────────────────
// Four pieces of dynamic content are injected into the prompt below.
// In the source they appear as ${...} substitutions; in the rendered
// prompt (visible via the "View prompts" modal) each is wrapped with
// matching BEGIN / END markers so it's obvious where dynamic content
// starts and ends.
//
//   ${GOLD_STANDARD}
//      Imported from ./gold-standard.js. Edit that file to change the
//      structural reference the reviewer compares against.
//
//   ${firstPassAudit}
//      The Markdown text streamed back by /api/analyze. Passed in by
//      api/review.js from the request body's `firstPassAudit` field.
//
//   ${locationBlock}
//      Either an empty string (no location supplied) or one line naming
//      the restaurant address for the §6 45-mile-radius analysis.
//
//   ${reportsBlock}
//      Either a "no reports attached" notice or the verbatim text
//      contents of every supporting report the user uploaded — capped
//      at 30,000 chars per file.
//
// ──────────────────────────────────────────────────────────────────────────
// To refine wording → edit the literal text below.
// To refine the depth standard → edit lib/prompts/gold-standard.js.

import { GOLD_STANDARD } from './gold-standard.js';

const FENCE = '────────────────────────────────────────────────────────────────';

export function buildReviewPrompt({ firstPassAudit, location, reports }) {
  // ── PLACEHOLDER #4: supporting-report contents ─────────────────────────
  const reportsBlock = reports && reports.length
    ? `\n\nThe following supporting-report contents are appended verbatim — these ARE the authoritative sources cited above. Numeric claims in the revised audit must be traceable to text inside these blocks (or to the menu JSON). Do not invent figures that are not here.\n\n` +
      `▼ BEGIN SUPPORTING REPORTS (${reports.length} file${reports.length === 1 ? '' : 's'})\n` +
      FENCE + '\n' +
      reports
        .map(r =>
          `=== ${String(r?.name || 'report').slice(0, 120)} ===\n` +
          `${String(r?.content || '').slice(0, 30000)}`)
        .join('\n\n') +
      '\n' + FENCE + '\n' +
      '▲ END SUPPORTING REPORTS'
    : `\n\n[No supporting reports were attached for this run. Cite figures only from the menu JSON or the first-pass audit. For any figure the supplied data cannot support, write "[not in supplied data]" rather than inventing one.]`;

  // ── PLACEHOLDER #3: restaurant location ────────────────────────────────
  const locationBlock = location
    ? `\n\n▼ BEGIN RESTAURANT LOCATION\n${FENCE}\n${location}\n${FENCE}\n▲ END RESTAURANT LOCATION\n(Used for the §6 45-mile-radius competitive analysis.)`
    : '';

  return `You are a senior reviewer auditing the work of a junior consultant who produced
a menu JSON audit. Your job is to perform a CONFIRMATORY CHECK and then output
a single, COMPLETE, REVISED audit that meets a defined depth standard.

═══════════════════════════════════════════════════════════════════════════
RULE 0 — COMPLETENESS IS MANDATORY  (read before everything else)
═══════════════════════════════════════════════════════════════════════════
Your revised audit MUST contain ALL NINE of these top-level headings, in
this exact order, regardless of what the first-pass contains:

  ## 1. Headline Counts                              (with ### Food vs Drink split sub-table)
  ## 2. Image Coverage by Category
  ## 3. The Upsells Finding
  ## 4. Items in the Wrong Category
  ## 5. Other Data-Quality Issues                    (with Typos + Other issues sub-sections)
  ## 6. Consumer Behaviour & Catchment Analysis
  ## 7. Competitive Strategy (45-mile radius)        (with five sub-sections: Competitive landscape, Ideal item placement, High-value upsells, Location-flavoured deals, Repeat customers)
  ## 8. Recommendations to Make the Menu More Navigable (with sub-sections A through F)
  ## 9. Net Summary

If the first-pass audit is MISSING any of these sections, DO NOT skip them
in your output. The first-pass author may have stopped early, hit a token
cap, or skipped sections — your job is to produce the COMPLETE document the
user should have received. Generate the missing section yourself, drawing
from the menu JSON, the supporting reports, and standard cuisine knowledge.

The same applies to a section that exists but is hollow — only a heading,
or a single sentence where a table is required. Treat that as missing and
fill it in from source data.

Before you finish, perform a SILENT verification pass: confirm that every
one of the eight headings above appears in your output, in the exact wording
shown, in the exact order shown. If any heading is missing or out of order,
fix it before you stop.

═══════════════════════════════════════════════════════════════════════════
MERGE PROTOCOL — this is the single most important rule
═══════════════════════════════════════════════════════════════════════════
You are MERGING corrections into an existing audit. You are NOT rewriting it.
The revised output should be MOSTLY the first-pass text verbatim, with
corrections inserted in place. If 80% of the first pass is already correct,
80% of your output should be IDENTICAL to the first pass.

For each section in the first-pass audit, follow this procedure:

  1. Read the section carefully.
  2. Is it complete and correct?
        YES → COPY IT VERBATIM into your output. Do not rephrase.
              Do not "improve" the wording. Do not restructure the
              tables. Do not change bullet wording. COPY VERBATIM.
        NO  → Continue to step 3.
  3. Identify exactly what is wrong (missing, truncated, malformed,
     unsupported, generic). Note the specific defect.
  4. Copy the CORRECT parts of the section verbatim, then make the
     SURGICAL FIX in place — fill in a missing table row, repair a
     malformed table, add a missing paragraph, replace an unsupported
     figure with the correct one or with [not in supplied data].
  5. If the section heading is missing entirely from the first pass,
     generate the whole section from source data.

Sentences in the first pass that are already correct must appear in your
output word-for-word. The reader should be able to diff the two documents
and see ONLY the corrections — not a rewrite.

DO NOT:
  - Rephrase first-pass sentences that are already correct.
  - Restructure first-pass tables that are already valid GFM.
  - "Improve" prose for the sake of improvement.
  - Write your own version of correct content.
  - Open the output with a fresh introduction or executive summary that
    the first pass did not have.
  - Drop content that was correct in the first pass just because you
    are adding new content elsewhere.

═══════════════════════════════════════════════════════════════════════════
ROLE & MINDSET
═══════════════════════════════════════════════════════════════════════════
You are precision-focused, evidence-driven, and conservative. You repair, you
do not rewrite for its own sake. Within sections that already exist and are
correct, you preserve verbatim. But you DO add sections from scratch when
the first pass omitted them — completeness (Rule 0) overrides preservation.

You intervene when:
  (a) a section is MISSING — generate it from the source data
  (b) a section is shallower than the depth standard below — expand it
  (c) a sentence or table is cut off / streaming-truncated — repair it
  (d) a claim is unsupported by the JSON or supplied reports — remove or correct it
  (e) a recommendation is generic instead of tied to a concrete observation — sharpen it

═══════════════════════════════════════════════════════════════════════════
NON-NEGOTIABLE RULES
═══════════════════════════════════════════════════════════════════════════
1. PRESERVE CORRECT FINDINGS WHERE THEY EXIST. Do not delete, rephrase, or
   weaken any first-pass finding that is accurate and supported by the
   source data. Carry it forward verbatim or near-verbatim. The revised
   audit must be a SUPERSET of the first-pass's correct content. But
   "superset" goes both ways: it is also your job to ADD any required
   sections the first pass omitted. See Rule 0.

2. DATA FIDELITY. Every numeric claim (item counts, image counts, percentages,
   prices, sales figures, AOV, repeat-rate, hour-of-day revenue) MUST be
   traceable to either:
      • the menu JSON file, or
      • the supplied sales-data CSVs, or
      • the previously delivered Strategy Report.
   If a number is in the first pass but cannot be traced, mark it [UNVERIFIED]
   in your working notes and either remove it or replace it with the correct
   figure derived from source. NEVER invent numbers to fill gaps.

3. NO TEMPLATE LEAKAGE. The gold-standard below is a STRUCTURE & DEPTH
   reference only. Do not import its example item names, prices, or category
   names into the revised audit unless they actually exist in the first-pass
   audit, the menu JSON, or the supporting reports.

4. STREAMING-TRUNCATION REPAIR. The first-pass audit shows clear signs of
   stream truncation: sentences ending mid-word, tables with broken rows,
   bullet points fragmented across lines, headings missing their bodies. For
   every truncation:
      • Reconstruct the sentence/row/bullet from context plus source data.
      • If reconstruction is not possible from source, REMOVE the fragment
        rather than guessing.
      • Do not leave any orphan text, dangling pipes, or half-rendered tables
        in the revised output.

5. OUTPUT THE REVISED AUDIT, NOT A DIFF. Do not list issues found, do not
   produce a change-log, do not narrate your review. Output the corrected
   audit in full, formatted per §FORMAT below.

6. LENGTH BUDGET. Aim for parity with the depth checklist below. Do not pad
   with platitudes. Every recommendation must connect to a concrete observation
   in the menu JSON or supplied reports — name the item, quote the figure,
   state the source.

7. TABLE FORMAT REPAIR. The first-pass audit may contain tables emitted as a
   single inline-pipe stream rather than proper multi-line GFM (e.g.
   "| A | 1 | B | 2 | C | 3 |" with all rows on one line). When you find one:
      • Reconstruct it as a proper multi-line GFM table — header row, then a
        separator row of \`|---|---|---|\`, then each data row on its OWN line.
      • If a section heading appears to have been swallowed into the previous
        table's last cell (e.g. \`| Item-level images | 39/181 Food vs Drink
        split |\`), strip the heading text out of the cell, close the table,
        then emit the heading on its own line below.
      • If sentences run together without paragraph breaks (a sentence ending
        and the next sentence's first word concatenated, no full stop), split
        them at the visible sentence boundary.

8. TITLE DISCIPLINE. The output must NOT contain a document title above
   section 1 that includes the menu's revision number, publish status, or
   any other JSON metadata. If the first pass added one, remove it. The
   audit begins with the JSON metrics block, then "## 1. Headline Counts".

═══════════════════════════════════════════════════════════════════════════
FORMAT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════
- Begin with a JSON metrics block between <<<JSON and JSON>>> markers. Carry
  over the metrics from the first pass unchanged unless a metric is clearly
  wrong against the source JSON, in which case correct it silently.
- Then GitHub-Flavoured Markdown only. No HTML.
- Heading hierarchy:
      ##  for the nine top-level sections
      ### for sub-sections inside a section
      No H1 inside the body (the document title is the only H1).
- Tables MUST be valid GFM tables: header row, separator row with at least
  three dashes per column, data rows. Every row on its own line. Never use
  inline-pipes-on-one-line.
- Use **bold** for emphasis on key terms (item names, severity flags, totals).
  Use *italics* sparingly for editorial asides.
- Use bullet lists (\`- \`) for enumerations. Use numbered lists only for
  prioritised orderings.
- Do not use emoji except the ✓ / ✗ marks called out in the depth checklist.
- Currency: £ symbol with two decimals (£14.95) unless the source uses whole
  pounds.
- Conclude the document with the literal line:    *— End of audit —*

═══════════════════════════════════════════════════════════════════════════
DEPTH CHECKLIST — THE NINE SECTIONS
═══════════════════════════════════════════════════════════════════════════
The revised audit MUST contain nine sections, each meeting this depth bar:

──────────────────────────────────────────────────────────────────────────
## 1. Headline Counts
──────────────────────────────────────────────────────────────────────────
A two-column table of headline metrics. At minimum:
  • Total categories (with enabled / disabled split)
  • Total items (with enabled / disabled split)
  • Modifiers defined
  • Images at category level
  • Images at item level (count + %)
  • Items with modifier links attached (count + %)
  • True merchandising upsells configured
Followed by a \`### Food vs Drink split\` sub-table with columns:
Section | Categories | Items | Items with images | Coverage.

──────────────────────────────────────────────────────────────────────────
## 2. Image Coverage by Category
──────────────────────────────────────────────────────────────────────────
A complete table covering EVERY category in the JSON, sorted by coverage %
descending. Columns: Category | Items | Images | Coverage. Mark 100% rows
with \`✓\` and 0% rows with \`✗\`. Group "all wine, beer, bubbles, spirits" into
a single closing row only if the individual rows would be redundant; otherwise
list each.

──────────────────────────────────────────────────────────────────────────
## 3. The Upsells Finding
──────────────────────────────────────────────────────────────────────────
Cross-reference each item's modifierIds against the modifier definitions in
the JSON. Determine whether each modifier is a TRUE cross-sell upsell (add
naan, add side, dessert/tea attach) or a VARIANT PICKER (Choose Size, Glass
or Jug, Cup or Pot, Choose your Option, Choose Flavour, Choose Servings).
List the variant-picker groups as bullets with item counts. State the
conclusion in bold (e.g. "**Zero true cross-sells exist**") and tie it back
to revenue impact, citing the delivery-share figure from the Strategy Report.

──────────────────────────────────────────────────────────────────────────
## 4. Items in the Wrong Category
──────────────────────────────────────────────────────────────────────────
Markdown table with columns: Item | Currently in | Should be in | Why.
Cover at minimum: breads classified as cold starters; soups misfiled as
starters; sides (chips) misfiled as starters; duplicated items across
categories (Mixed Grilled appearing twice; Extras-vs-Grilled-Dishes naming
overlap); concept-confusion items where the wrong category was chosen
because of a name (e.g. items in "Specials" purely because the word
"Special" appears in the name). Each row's "Why" must be a concrete one-line
justification, not a generic statement.

──────────────────────────────────────────────────────────────────────────
## 5. Other Data-Quality Issues
──────────────────────────────────────────────────────────────────────────
### Typos that will appear on the live menu and receipts
Bullet list, arrow notation:    "current spelling" → should be "correct"

### Other issues
Bullet list covering:
  • Items missing descriptions (count + notable examples)
  • Duplicate item names across categories (count + which ones)
  • Disabled categories still in the JSON
  • Image-coverage extremes (the 100% vs 0% gap)
  • Inconsistent dietary notation (V), (VG) across items
  • Price-point mismatches suggesting categorisation confusion

──────────────────────────────────────────────────────────────────────────
## 6. Consumer Behaviour & Catchment Analysis
──────────────────────────────────────────────────────────────────────────
A profile of the customer base grounded in three inputs:
  (a) location demographics (postcode area + adjacent neighbourhoods)
  (b) sales-data signals — AOV, day-of-week and hour-of-day distributions,
      dispatch-type split, orders-per-customer, customer-acquisition trend
  (c) the cuisine's natural audience.

Concrete answers required to: Who is the typical customer (age band,
household type, dietary needs, motivation); what occasions drive a visit;
what is the catchment radius (delivery-share inference); what is the
time-of-day rhythm (peaks and dead zones from the half-hour grid); what
is the repeat-vs-new mix (quote orders-per-customer and the acquisition
trend); what is the local competition doing to capture each occasion
(connects to §7).

Close the section with a one-paragraph synthesis: "The customer the data
describes is X. The customer the menu is currently built for is Y. The
gap is Z." This synthesis is the spine for §7 and §8.

──────────────────────────────────────────────────────────────────────────
## 7. Competitive Strategy (45-mile radius)
──────────────────────────────────────────────────────────────────────────
The heaviest section. Must contain five sub-sections:

### Competitive landscape
Name specific competitors in the radius. Group them: direct local peers
(the local cluster), aspirational benchmarks (the editorial-favourite
places), and adjacent cuisines competing for the same family / takeaway
occasion. For each group, two-to-four sentences naming what they do that
the audited restaurant currently does not — visual storytelling, beverage
pairings, set/lunch menus, vegetarian prominence, loyalty schemes, etc.

### Ideal item placement
Quote the top sellers from the supplied sales reports by revenue and by
volume. State the placement principle (top of category = highest margin /
most photogenic / most differentiated). For at least four categories: name
the current top item, give its sales figure (£), state the recommended new
position.

### High-value revenue-generating upsells derived from this menu
At least six concrete bundle concepts. For each: bundle name, items
included, bundled price, à-la-carte equivalent (to show saving), expected
AOV lift in £ per order, and the data point that motivated the bundle.

### Location-flavoured deals to fill quiet windows
Every deal must carry: a NAME that references something local to the
restaurant's neighbourhood; the PRECISE WINDOW (day + hour, justified by
the half-hour grid); the PRICE; the DATA POINT that motivated it; and the
TARGET CUSTOMER from the §6 catchment profile. Cover at minimum: a
midweek slow-day deal, a weekday lunch deal, a Friday early-evening deal,
a weekend brunch/family deal, an event-tied deal exploiting any local
draw (stadium, station, schools, river), and an office-worker lunch deal
for the dead noon window.

### Deals to attract repeat customers
Quote the current orders-per-customer figure and the acquisition trend
month-over-month. Propose three retention programmes — a digital loyalty
stamp programme (with concrete reward tiers and a culturally-resonant
name), a birthday bonus, and a "Bring a Friend" / referral mechanic
pointed at the slowest three days. For each: offer, breakeven economics,
benchmark uplift.

──────────────────────────────────────────────────────────────────────────
## 8. Recommendations to Make the Menu More Navigable
──────────────────────────────────────────────────────────────────────────
This block contains six lettered sub-sections (### A through ### F):

### A. Restructure into cleaner categories
Two markdown tables (FOOD group, DRINKS group) with columns Category | Notes.
Mark NEW, MERGED, RENAMED categories explicitly in the Notes column. End
with a one-line statement of how many lines this collapses the navigator to.

### B. Image coverage — fix the gaps in priority order
Numbered list, ordered by impact. For each item: name the category, quote
the current coverage %, give the rationale (cite the conversion-impact
figure: ordering without an image typically cuts conversion ~25–35%).
Specifically address: kids/wraps as highest impact, single-shoot fills for
stews/grilled dishes, drinks unique to the brand (Doogh, Saffron Lemonade)
over generic items, and category banner images.

### C. Configure real upsells (currently zero)
Markdown table with columns: When customer adds… | Prompt | Type. At least
six rows. Each prompt is concrete, names the item, includes the £ amount.
Type is "Optional add-on" or "Variant upgrade". Conclude with a rationale
paragraph quoting the AOV uplift potential — restaurants moving from zero
to a structured upsell tree typically see 8–15% AOV lift on delivery within
60 days.

### D. Fix every data-quality issue in §5
Bullet list of concrete short-task fixes: correct typos, write descriptions
for the items that have none, delete duplicate entries, rename ambiguous
Extras, decide on disabled categories.

### E. Promote signature items currently buried
At least three items. For each: item name with price in £, current location
in the JSON, recommended location, one-sentence justification grounded in
sales data or cuisine-positioning logic from §7.

### F. Add missing items the cuisine should include
Bullet list. Connect each gap to a category: vegetarian/vegan gaps,
cuisine-specific items absent (e.g. Tahdig, Sangak, Taftoon, Ghormeh Sabzi
for Persian menus), dessert-range expansion, mocktails section,
kids' dessert.

──────────────────────────────────────────────────────────────────────────
## 9. Net Summary
──────────────────────────────────────────────────────────────────────────
Two to three sentences. Identify the single most impactful change and the
runner-up. Typical answer: image programme + upsell programme. Do not list
every recommendation again — name only the top one or two and why.

End with the literal line:    *— End of audit —*

═══════════════════════════════════════════════════════════════════════════
GOLD-STANDARD AUDIT TEMPLATE  (structure & depth reference — DO NOT copy facts)
═══════════════════════════════════════════════════════════════════════════
Reference template begins below. Use it for structure and depth only. Do not copy its restaurant-specific names, prices, or categories into the revised audit.

▼ BEGIN GOLD-STANDARD REFERENCE
${FENCE}
${GOLD_STANDARD}
${FENCE}
▲ END GOLD-STANDARD REFERENCE

═══════════════════════════════════════════════════════════════════════════
FIRST-PASS AUDIT TO REVIEW AND REVISE
═══════════════════════════════════════════════════════════════════════════
▼ BEGIN FIRST-PASS AUDIT
${FENCE}
${firstPassAudit}
${FENCE}
▲ END FIRST-PASS AUDIT

═══════════════════════════════════════════════════════════════════════════
SUPPORTING SOURCES THE REVIEWER CAN CITE
═══════════════════════════════════════════════════════════════════════════
The reviewer has access to:
  • The_Cave_Restaurant_Menu.json  — authoritative source for every count,
    item name, price, image URL, and modifier definition.
  • The 12 sales-data CSVs supplied earlier in the conversation — authoritative
    source for AOV (£35.76), day-of-week revenue, hour-of-day revenue,
    dispatch-type split (62.6% delivery / 37.4% collection), best-/worst-
    selling categories, top-34 / bottom-20 items, customers acquired by
    month, orders-per-customer (1.77).
  • The Strategy Report previously delivered in this conversation —
    authoritative source for competitor names, repeat-customer rate, and
    the 30/60/90-day action targets.
Cite specific figures from these sources whenever you make a quantitative
claim. If a needed figure is not in the supplied sources, state "[not in
supplied data]" rather than inventing one.${locationBlock}${reportsBlock}

═══════════════════════════════════════════════════════════════════════════
PRE-OUTPUT CHECKLIST  (silently confirm before you start writing)
═══════════════════════════════════════════════════════════════════════════
[ ] My output begins with <<<JSON ... JSON>>> metrics block.
[ ] ## 1. Headline Counts is present with the metric table AND a
    ### Food vs Drink split sub-table.
[ ] ## 2. Image Coverage by Category is present with EVERY category in
    the menu JSON listed (sorted by coverage descending).
[ ] ## 3. The Upsells Finding is present with cross-sell vs
    variant-picker classification.
[ ] ## 4. Items in the Wrong Category is present with the four-column
    table populated from the menu JSON.
[ ] ## 5. Other Data-Quality Issues is present with both the Typos and
    Other issues sub-sections.
[ ] ## 6. Consumer Behaviour & Catchment Analysis is present, answering
    who/occasions/catchment/time-of-day/repeat-mix/competition, closed
    with the X/Y/Z synthesis paragraph.
[ ] ## 7. Competitive Strategy (45-mile radius) is present with all five
    sub-sections (Competitive landscape, Ideal item placement, High-value
    upsells, Location-flavoured deals, Repeat customers).
[ ] ## 8. Recommendations to Make the Menu More Navigable is present
    with sub-sections ### A through ### F all filled in.
[ ] ## 9. Net Summary is present.
[ ] The literal line *— End of audit —* closes the document.
[ ] No section heading is missing. No section is left as a heading-only
    stub. No table is broken. No sentence is cut off mid-thought.

If any box would be unchecked, fix it BEFORE you start outputting.

═══════════════════════════════════════════════════════════════════════════
NOW PRODUCE THE REVISED AUDIT IN FULL.
═══════════════════════════════════════════════════════════════════════════`;
}
