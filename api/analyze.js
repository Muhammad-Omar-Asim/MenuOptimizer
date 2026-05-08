export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY env var' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body must be JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const menu = body?.menu;
  if (!menu) {
    return new Response(JSON.stringify({ error: 'Missing "menu" field in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const location = (body?.location || '').toString().trim();
  const reports = Array.isArray(body?.supportingReports) ? body.supportingReports : [];

  // Strip noise fields, base64 image data, HTML tags, and very long strings
  // so a typical Flipdish export fits inside Sonnet 4.5's 200K context.
  const NOISE_KEYS = new Set([
    'createdAt','updatedAt','modifiedAt','deletedAt',
    'imageBase64','imageData','imageBlob','rawHtml','rawHtmlContent',
    'etag','hash','sha','signature','htmlBody','rawJson'
  ]);
  function slimMenu(v) {
    if (v == null) return v;
    if (typeof v === 'string') {
      if (v.startsWith('data:image') || v.startsWith('data:application')) return '[binary]';
      let s = v;
      if (/<[a-z][^>]*>/i.test(s)) s = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (s.length > 600) s = s.slice(0, 600) + `…[+${s.length - 600} chars]`;
      return s;
    }
    if (Array.isArray(v)) return v.map(slimMenu);
    if (typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (NOISE_KEYS.has(k)) continue;
        out[k] = slimMenu(val);
      }
      return out;
    }
    return v;
  }

  const slim = slimMenu(menu);
  const menuJson = JSON.stringify(slim);

  // Hard char budget for prompt input (≈ tokens × 4). We reserve room for
  // the audit instructions, the supporting reports, and the model's output.
  const MAX_MENU_CHARS = 550_000;   // ~135K tokens
  if (menuJson.length > MAX_MENU_CHARS) {
    return new Response(JSON.stringify({
      error: `Menu JSON is ${(menuJson.length/1000).toFixed(0)}KB after slimming, which exceeds the ${(MAX_MENU_CHARS/1000)}KB budget. Try removing base64 image data or splitting the menu into sections.`
    }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  const reportsBlock = reports.length
    ? `\n\nSUPPORTING BUSINESS REPORTS — use these as additional context when forming recommendations. Cite figures from them when relevant.\n\n` +
      reports.map(r => `=== ${String(r?.name || 'report').slice(0, 120)} ===\n${String(r?.content || '').slice(0, 60000)}`).join('\n\n')
    : '';

  const locationBlock = location
    ? `\n\nRESTAURANT LOCATION: ${location}\nWhen producing competitive analysis, take a 45-mile radius around this location into consideration.`
    : '';

  const prompt = `You are a high-value, sought-after menu consultant who works on increasing revenue, aesthetics, clarity, and website ranking of restaurant menus.

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

MENU JSON (pre-processed: HTML stripped, binary blobs replaced with [binary], very long strings truncated):
\`\`\`json
${menuJson}
\`\`\`${reportsBlock}`;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Anthropic API ${upstream.status}: ${errText}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
