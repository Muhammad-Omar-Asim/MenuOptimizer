import { markdownToNotionBlocks } from '../lib/markdown-to-notion-blocks.js';

export const config = { runtime: 'edge' };

// Creates a new Notion page under the configured parent page, containing
// the audit markdown converted to Notion blocks. Triggered by the
// "Send to Notion" button on the tool.
//
// Required env vars (set on Vercel):
//   NOTION_TOKEN            - internal-integration secret (ntn_… / secret_…)
//   NOTION_PARENT_PAGE_ID   - 32-char hex ID of the parent page (dashes OK)
//
// Request body: { auditMd, restaurantName?, dateStr? }
// Response:     { url } on success, { error } on failure.

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const CHILDREN_PER_REQUEST = 100; // Notion's hard cap per call

function jsonError(status, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed');

  const token = (process.env.NOTION_TOKEN || '').trim();
  const parentId = (process.env.NOTION_PARENT_PAGE_ID || '').trim();
  if (!token || !parentId) {
    return jsonError(500, 'Server is not configured for Notion (missing NOTION_TOKEN or NOTION_PARENT_PAGE_ID env var).');
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonError(400, 'Request body must be JSON'); }

  const auditMd = String(body?.auditMd || '').trim();
  if (!auditMd) return jsonError(400, 'Missing auditMd');

  const restaurantName = String(body?.restaurantName || 'Menu').trim() || 'Menu';
  const dateStr = String(body?.dateStr || '').trim() ||
    new Date().toISOString().slice(0, 10);

  const title = `${restaurantName} — Menu Audit (${dateStr})`;

  let blocks;
  try {
    blocks = markdownToNotionBlocks(auditMd);
  } catch (e) {
    return jsonError(500, 'Failed to convert markdown to Notion blocks: ' + e.message);
  }
  if (!blocks.length) return jsonError(400, 'Audit markdown produced no Notion blocks');

  const notionHeaders = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  // Create the page with the first chunk of children. The rest get
  // appended via PATCH /v1/blocks/{id}/children below.
  const firstChunk = blocks.slice(0, CHILDREN_PER_REQUEST);
  const remaining = blocks.slice(CHILDREN_PER_REQUEST);

  const createRes = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders,
    body: JSON.stringify({
      parent: { page_id: parentId },
      properties: {
        title: { title: [{ type: 'text', text: { content: title } }] },
      },
      children: firstChunk,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return jsonError(createRes.status,
      `Notion page creation failed (${createRes.status}): ${errText}`);
  }

  const page = await createRes.json();

  // Append remaining children in chunks of 100. Sequential — Notion's
  // PATCH endpoint orders children by request order, so concurrent calls
  // would shuffle the document.
  for (let i = 0; i < remaining.length; i += CHILDREN_PER_REQUEST) {
    const chunk = remaining.slice(i, i + CHILDREN_PER_REQUEST);
    const appendRes = await fetch(`${NOTION_API}/blocks/${page.id}/children`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({ children: chunk }),
    });
    if (!appendRes.ok) {
      const errText = await appendRes.text();
      // Page was created but the tail failed to append — surface the URL
      // anyway so the user can see what we did manage to write.
      return new Response(JSON.stringify({
        url: page.url,
        partial: true,
        error: `Page created but appending blocks ${i + CHILDREN_PER_REQUEST}+ failed: ${errText}`,
      }), {
        status: 207,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ url: page.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
