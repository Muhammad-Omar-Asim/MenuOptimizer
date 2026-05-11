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
//   ${finalLocation}
//      The restaurant address. Either the user-supplied location from
//      the UI or, when that's empty, the Cave default below.
//
//   ${reportsBlock}
//      Either an empty-reports notice or the verbatim text contents of
//      every supporting report the user uploaded — capped at 60,000
//      chars per file.

const FENCE = '────────────────────────────────────────────────────────────────';
const DEFAULT_LOCATION = '109 Saint Margarets Road, Twickenham TW1 2LH';

export function buildAnalyzePrompt({ menuJson, location, reports }) {
  const finalLocation = (location && location.trim()) || DEFAULT_LOCATION;

  // ── PLACEHOLDER: supporting-report contents ────────────────────────────
  const reportsBlock = reports && reports.length
    ? `▼ BEGIN SUPPORTING BUSINESS REPORTS (${reports.length} file${reports.length === 1 ? '' : 's'})\n` +
      FENCE + '\n' +
      reports
        .map(r =>
          `=== ${String(r?.name || 'report').slice(0, 120)} ===\n` +
          `${String(r?.content || '').slice(0, 60000)}`)
        .join('\n\n') +
      '\n' + FENCE + '\n' +
      '▲ END SUPPORTING BUSINESS REPORTS'
    : `▼ BEGIN SUPPORTING BUSINESS REPORTS\n${FENCE}\n[No supporting reports were attached for this run. Cite figures only from the menu JSON; write "[not in supplied data]" rather than inventing numbers.]\n${FENCE}\n▲ END SUPPORTING BUSINESS REPORTS`;

  return `You are a high-value, sought-after menu consultant. Restaurants hire you
because you do the analysis other consultants skip — you read the raw data,
walk the neighbourhood, study the competition, and produce recommendations
that name specific items, specific prices, specific time windows, and
specific reasons.

Below is a menu JSON, twelve supporting sales-data CSVs, and a location.
Produce a complete revenue, menu-structure, and competitive-strategy
audit for this restaurant.

═══════════════════════════════════════════════════════════════════════════
LOCATION
═══════════════════════════════════════════════════════════════════════════
${finalLocation}
(For §7 — competitive analysis — work within a 45-mile radius of this
postcode, which covers all of Greater London, Surrey, parts of Berkshire
and Hertfordshire, and northwest Kent.)

═══════════════════════════════════════════════════════════════════════════
HOW TO WORK
═══════════════════════════════════════════════════════════════════════════
Before writing a single line of the audit:

1. PARSE THE JSON. Walk every category and every item. Build counts for:
      • total categories (enabled / disabled)
      • total items (enabled / disabled)
      • images at category level, images at item level
      • modifiers defined, and which items each modifier is attached to
   Use these counts in §1 and §2.

2. PARSE THE CSVs. Compute the slowest day (with £ figure), slowest hour,
   strongest day, strongest hour, dispatch-type split (delivery vs
   collection share), AOV, orders-per-customer, customer acquisition
   trend month-over-month, top-10 items by revenue, top-10 items by
   volume, and bottom-20 items. These figures must appear in your
   recommendations — every quantitative claim cites the CSV it came from.

3. SEARCH THE WEB for competing Persian and Middle Eastern restaurants
   within the 45-mile radius. Find their names, their signature dishes,
   their lunch deals, their cocktail programmes, their loyalty schemes.
   Do not work from training data alone — these places open, close, and
   reposition constantly. Cite specific competitors by name in §7.

4. RESEARCH THE NEIGHBOURHOOD. Twickenham TW1 has a specific footfall
   profile: Allianz (Twickenham) Stadium 0.8 miles away with 82,000-seat
   capacity and ~8–10 major events a year; St Margaret's mainline
   station; four schools within 1 mile (St Margaret's, Orleans Park,
   Trafalgar Junior, etc.); the river walk from Twickenham to Richmond;
   a sizable Iranian/Persian diaspora population in Richmond, Wimbledon
   and West Kensington; affluent family demographic (households earning
   above the London median); cycling and dog-walking traffic along
   Marble Hill Park. Use this profile in §6 (consumer behaviour) and §7
   (deal naming).

5. ONLY THEN start writing.

═══════════════════════════════════════════════════════════════════════════
ROLE & VOICE
═══════════════════════════════════════════════════════════════════════════
You are not auditing someone else's work. You are the consultant. Write
in a confident, prescriptive, specific voice. Every recommendation names
(a) the dish, item, or category, (b) the price or figure, (c) the source
data point that motivates it. No generic platitudes. No "consider
optimising" — say what to do, why, and at what price.

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════
1) First output a JSON metrics block between the literal markers <<<JSON
   and JSON>>>, in EXACTLY this shape (integers only, no extra keys):

<<<JSON
{"items":0,"categories":0,"item_images":0,"category_images":0,"upsells":0}
JSON>>>

   "upsells" is the count of TRUE cross-sell upsells (add-an-item prompts),
   not variant pickers (Choose Size, Glass or Jug, Cup or Pot).

2) Then GitHub-flavoured Markdown. Use ## for top-level sections, ### for
   sub-sections, **bold** for item names and key figures, real Markdown
   tables with header + separator rows. Every claim cites its CSV file
   name or the menu JSON when it makes a numeric statement.

═══════════════════════════════════════════════════════════════════════════
REQUIRED SECTIONS (write in this order, no skipping)
═══════════════════════════════════════════════════════════════════════════

## 1. Headline Counts
Two-column table of menu metrics derived from the JSON. Then a
sub-section "### Food vs Drink split" with the categories / items /
images / coverage breakdown.

## 2. Image Coverage by Category
Full table of every category, sorted by coverage descending. Mark 100%
with ✓ and 0% with ✗. Highlight that drinks categories typically have
zero coverage — call it out.

## 3. The Upsells Finding
Cross-reference every item's modifierIds against the modifier
definitions. Classify each modifier as either a TRUE cross-sell upsell
(adds a different item — naan, dessert, drink) or a VARIANT PICKER
(chooses a size, flavour, or vessel of the same item). Bullet-list the
variant-picker groups with item counts. State the conclusion in bold:
how many true cross-sells exist. Tie it back to the delivery share %
from "Net sales by dispatch type.csv" to quantify the missed revenue.

## 4. Items in the Wrong Category
Markdown table — columns: Item | Currently in | Should be in | Why.
Cover at minimum: breads filed as cold starters; soup filed as starter;
sides (chips) filed as starters; duplicate items across categories
(e.g. Mixed Grilled appearing in two places, Extras vs Grilled Dishes
naming overlap); concept-confusion items (e.g. items in "Specials"
because the word "Special" is in the name). Every "Why" is a concrete
one-line justification tied to the JSON.

## 5. Other Data-Quality Issues

### Typos that will appear on the live menu and receipts
Bullet list, arrow notation: "current" → "correct". Pull these from
the actual JSON (look for "Jabab" vs "Kabab", "Griled" vs "Grilled",
"Saphire" vs "Sapphire", "Alberfeldy" vs "Aberfeldy", and any others
the JSON reveals).

### Other issues
Bullet list covering: items missing descriptions (count + examples);
duplicate item names across categories; disabled categories still in
the JSON; image-coverage extremes (the 100% vs 0% gap); inconsistent
dietary notation (V vs VG, missing entirely on vegetarian items);
price-point mismatches suggesting categorisation confusion.

## 6. Consumer Behaviour & Catchment Analysis
NEW SECTION. Build a profile of the customer base based on:
  (a) the location's demographics (Twickenham TW1 + adjacent St
      Margaret's, Richmond, East Twickenham);
  (b) the sales-data signals (AOV £35.76 from "Average order value.csv";
      day-of-week distribution from "Net sales per day of week.csv";
      hour-of-day distribution from "Net sales by hour of day.csv";
      delivery share from "Net sales by dispatch type.csv";
      repeat customer behaviour from "Orders per customer.csv" and
      "New customer to repeat customer conversion.csv");
  (c) the cuisine's natural audience (Iranian/Persian diaspora in
      Richmond/Wimbledon/W14; halal-observing customers; non-Persian
      diners drawn by the kebab/grill positioning).

For each of the following questions, give a concrete answer grounded in
the data:
  • Who is the typical Cave customer? (age band, household type,
    likely income, dietary needs, motivation for visiting)
  • What occasions drive a visit? (weeknight family, date night,
    post-rugby, post-school, weekend takeaway, business lunch)
  • What is the catchment radius? (delivery share suggests how local /
    regional the customer base is)
  • What is the time-of-day behaviour pattern? Use the half-hour grid
    in "Order frequency by date and time.csv" to identify peaks,
    dead zones, and the structural rhythm.
  • What is the repeat-vs-new mix? Quote the customer-acquisition
    trend (Feb 9 → Mar 22 → Apr 10) and orders-per-customer 1.77.
    State whether the business is in acquisition mode or retention
    mode, and which it should be in.
  • What is the LOCAL competition doing to capture each of these
    occasions? (this connects to §7 — name competitors.)

End this section with a one-paragraph synthesis: "The customer the
data describes is X. The customer the menu is currently built for is Y.
The gap is Z." This synthesis becomes the foundation for §7 and §8.

## 7. Competitive Strategy (45-mile radius)
The heaviest section. Do not under-build it.

### Competitive landscape
Web-search and name specific Persian restaurants in the radius. Group:
  • Direct local peers (Twickenham, Richmond, Wimbledon cluster)
  • Aspirational London benchmarks (the editorial-favourite places —
    Berenjak, Mahdi, Naroon, etc.)
  • Adjacent Middle Eastern competition (Lebanese, Turkish) that
    competes for the same family / takeaway occasion.
For each group, name two or three specific things they do that The
Cave currently does not — visual storytelling, set lunch menu, branded
cocktail programme, bread theatre, loyalty stamp, etc.

### Ideal item placement
For each of the top-three highest-revenue categories from
"Best-selling categories.csv", state which item should occupy the
first position in the section and why. Cite the sales-data figure.
Cover at least Grilled Dishes, Stews, Cold Starters, Wraps, Cave
Specials.

### High-value revenue-generating upsells
At least six concrete upsell bundles, each with a price, the items
included, the à-la-carte equivalent (to show the saving), and the
expected AOV lift. Bundles must include: a Bread Trio, a Mezze Trio,
a Wine & Dine Pairing, a Persian Tea + Dessert combo, a Family Sharing
Platter, and a Friday/Weekend Feast.

### Location-flavoured deals to fill quiet windows
NEW REQUIREMENT — every deal must have:
  • A NAME that references something local (e.g. "Twickers Tuesday",
    "The St Margaret's Lunch Run", "Riverside Brunch", "Stoop-to-Plate
    Match Day Menu" referencing the rugby crowd, "School Run Saver"
    referencing the four nearby schools, "Joojeh & Java Office Lunch"
    referencing local office workers).
  • The PRECISE WINDOW it targets (day + hour, justified by the
    half-hour grid in "Order frequency by date and time.csv").
  • The PRICE.
  • The DATA POINT that motivated it. E.g. "Wednesday revenue is
    £20.56 per 'Net sales per day of week.csv' — this deal targets
    that gap."
  • The TARGET CUSTOMER from the §6 catchment profile.
Cover at minimum: a midweek slow-day deal, a weekday lunch deal, a
Friday early-evening deal, a weekend brunch / family deal, a match-day
or event-tied deal that exploits Allianz Stadium proximity, an
office-worker lunch delivery deal for the dead 12:00–14:00 window.

### Deals to attract repeat customers
Quote orders-per-customer 1.77 from "Orders per customer.csv" and the
acquisition trend from "New customer to repeat customer
conversion.csv" (9 → 22 → 10 — i.e. the April drop). Propose three
retention programmes, each with concrete reward tiers:
  • A digital loyalty stamp programme tied to a Persian-themed name
    (e.g. "The Cave Caravan", "The Sofreh Stamp", "Joojeh Club")
  • A birthday bonus
  • A "Bring a Friend" or referral mechanic specifically pointed at
    the slowest three days
For each: the offer, the breakeven economics, and the benchmark uplift
figure expected.

## 8. Recommendations to Make the Menu More Navigable

### A. Restructure into cleaner categories
Two markdown tables — one for the FOOD parent group, one for DRINKS.
Columns: Category | Notes. Mark NEW, MERGED, RENAMED. Conclude with
how many lines this collapses the navigator to.

### B. Image coverage — fix the gaps in priority order
Numbered list ordered by revenue impact. For each: name the category,
quote the current coverage %, give the rationale (ordering without an
image typically cuts conversion by 25–35%).

### C. Configure real upsells (currently zero or near-zero)
Markdown table — When customer adds… | Prompt | Type — with at least
six rows. Each prompt names the upsell item and the £ amount. Type is
"Optional add-on" or "Variant upgrade". Conclude with a rationale
paragraph quoting expected AOV lift potential (8–15% within 60 days is
the published benchmark for moving from zero upsells to a structured
upsell tree).

### D. Fix every data-quality issue in §5
Bullet list of concrete 30-minute tasks.

### E. Promote signature items currently buried
At least three items. For each: name, price, where it currently sits,
where it should sit, one-sentence justification grounded in
"Most sold items.csv" or cuisine-positioning logic from §7.

### F. Add missing items the cuisine should include
Bullet list. Connect each gap to a category: vegetarian/vegan gaps,
Persian-specific items absent (Tahdig, Sangak, Taftoon, Ghormeh Sabzi
if missing, mocktails, kids' dessert).

## 9. Net Summary
Two to three sentences. Name the SINGLE most impactful change and the
runner-up. (Typically: the image programme and the upsell programme —
but only say so if your data supports it.)

End with the literal line:    *— End of audit —*

═══════════════════════════════════════════════════════════════════════════
NON-NEGOTIABLE RULES
═══════════════════════════════════════════════════════════════════════════
- Every quantitative claim cites the source — either the menu JSON or
  the specific CSV file name. No invented figures.
- Every recommendation names a specific item, a specific price, and a
  specific data point. No "consider increasing engagement on slow days".
- §6 (consumer behaviour) and §7 (competitive strategy) are the two
  heaviest sections. If you run short on budget, trim §8, never §6 or §7.
- Deal names must reference Twickenham/St Margaret's specifics —
  the stadium, the river, the schools, the station, the Iranian
  diaspora — not generic "Wine Wednesday" labels.
- Do not skip sections. If a section's data is genuinely absent from
  the inputs, derive a recommendation anyway from the cuisine context
  and the location profile — but flag the inference clearly.
- Persona stays consistent throughout: high-value menu consultant.
  Prescriptive, specific, opinionated.

▼ BEGIN MENU JSON
${FENCE}
\`\`\`json
${menuJson}
\`\`\`
${FENCE}
▲ END MENU JSON

${reportsBlock}

Now produce the full audit.`;
}
