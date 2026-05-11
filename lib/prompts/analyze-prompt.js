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

═══════════════════════════════════════════════════════════════════════════
STREAMING DISCIPLINE — NEWLINE PRESERVATION  (read before everything else)
═══════════════════════════════════════════════════════════════════════════
Markdown structure depends on real newline characters between blocks. Emit a
literal newline ('\\n') after every:
  • Markdown table row — header, separator, AND each data row
  • Markdown list item
  • Heading line
  • Paragraph

NEVER concatenate multiple table rows onto one line. NEVER emit table
content as a single pipe-delimited stream. The downstream renderer parses
Markdown line-by-line; a row missing its trailing newline merges into the
next row and degrades into literal pipe text.

Anti-patterns to avoid (these have happened on previous runs):

  WRONG — multiple rows on one line:
      | Section | Categories | Items | Items with images SALADS | 5 | 5 | 100% ✓ | DESSERTS | 8 | 8 | 100% ✓ |

  RIGHT — every row on its own line, with separator:
      | Section | Categories | Items | Items with images |
      |---|---|---|---|
      | Food | 12 | 91 | 51 |
      | Drinks | 10 | 56 | 4 |

  WRONG — heading swallowed into the previous table's cell:
      | Item-level images | 39 / 181 Food vs Drink split |

  RIGHT — heading on its own line below the table:
      | Item-level images | 39 / 181 (22%) |

      ### Food vs Drink split

      | Section | Categories | Items | Items with images |

If you sense you're approaching a token limit, truncate cleanly with the
literal string "(continued)" on its own line rather than compressing
newlines or collapsing rows.

TITLE RULE: do not add a document title above section 1. Do NOT include the
restaurant's menu-revision number, publish status, or other JSON metadata
anywhere in the output. Begin the audit directly with the JSON metrics
block, then "## 1. Headline Counts".

═══════════════════════════════════════════════════════════════════════════
COMPLETENESS — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════
The revised audit MUST include EVERY ONE of the following top-level
sections, in this exact order. Each section is REQUIRED — do not skip,
collapse, merge, or rename any of them. If you cannot find data in the
menu JSON to fill a section, write a one-line "(no data)" note under it
and move on, but the heading itself must appear:

  ## 1. Headline Counts                              (with Food vs Drink split sub-table)
  ## 2. Image Coverage by Category
  ## 3. The "Upsells" Finding
  ## 4. Items in the Wrong Category
  ## 5. Other Data-Quality Issues                    (with Typos + Other issues sub-sections)
  ## Recommendations to Make the Menu More Navigable (with sub-sections A through F)${location ? `
  ## 6. Revenue & Competitive Strategy (45-mile radius)` : ''}
  ## Net Summary

Write the sections IN THIS ORDER. Do not start at section 3. Do not
emit a partial section and then skip ahead. Before you finish, verify
silently that all of the headings above are present in your output.

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — strictly:
1) FIRST output a single JSON metrics block on its own lines, between the literal markers <<<JSON and JSON>>>, in EXACTLY this shape (integers only, no extra keys):
<<<JSON
{"items":0,"categories":0,"item_images":0,"category_images":0,"upsells":0}
JSON>>>
2) THEN output the rest of the audit as GitHub-flavoured Markdown using the section structure below. Use real Markdown tables (with header row + separator) for every tabular section. Use ## for top-level sections, ### for sub-sections. Use **bold** for emphasis on category names, item names, and key counts. Keep prose tight and consultant-grade.

REQUIRED SECTIONS — DEPTH CHECKLIST:

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
a single closing row only if the individual rows would be redundant;
otherwise list each.

──────────────────────────────────────────────────────────────────────────
## 3. The "Upsells" Finding — Important
──────────────────────────────────────────────────────────────────────────
Cross-reference each item's modifierIds against the modifier definitions in
the JSON. Determine whether each modifier is a TRUE cross-sell upsell (add
naan, add side, dessert/tea attach) or a VARIANT PICKER (Choose Size, Glass
or Jug, Cup or Pot, Choose your Option, Choose Flavour, Choose Servings).
List the variant-picker groups as bullets with item counts. State the
conclusion in bold (e.g. "**Zero true cross-sells exist**") and tie it back
to revenue impact, citing the delivery-share figure from any supplied
business reports.

──────────────────────────────────────────────────────────────────────────
## 4. Items in the Wrong Category
──────────────────────────────────────────────────────────────────────────
Markdown table with columns: Item | Currently in | Should be in | Why.
Cover at minimum: breads classified as cold starters; soups misfiled as
starters; sides (chips) misfiled as starters; duplicated items across
categories (e.g. Mixed Grilled appearing twice; Extras-vs-Grilled-Dishes
naming overlap); concept-confusion items where the wrong category was
chosen because of a name (e.g. items in "Specials" purely because the
word "Special" appears in the name). Each row's "Why" must be a concrete
one-line justification, not a generic statement.

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
