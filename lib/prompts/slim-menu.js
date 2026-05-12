// Sanitize a menu JSON before sending it to Claude.
//
// Conservative: only strip what is truly noise (binary blobs that the model
// can't act on, HTML tags around descriptions, fields that are pure
// timestamps/hashes). Preserves every item name, price, description, and
// modifier reference so the model sees the same data a user pasting the
// JSON into claude.ai would see.

export const NOISE_KEYS = new Set([
  'createdAt', 'updatedAt', 'modifiedAt', 'deletedAt',
  'imageBase64', 'imageData', 'imageBlob',
  'rawHtml', 'rawHtmlContent', 'htmlBody', 'rawJson',
  'etag', 'hash', 'sha', 'signature',
]);

// Very high cap — only fires on pathological strings (multi-page lorem ipsum,
// embedded log dumps, etc.). Real item descriptions never approach this.
const HARD_STRING_CAP = 50000;

export function slimMenu(v) {
  if (v == null) return v;
  if (typeof v === 'string') {
    // Replace embedded binary data URIs with a marker — the model can't act
    // on raw bytes anyway, and they cost a lot of tokens.
    if (v.startsWith('data:image') || v.startsWith('data:application')) return '[binary]';
    let s = v;
    // Strip HTML tags from descriptions (Flipdish exports often have rich-text
    // HTML in description fields). Preserve the visible text.
    if (/<[a-z][^>]*>/i.test(s)) {
      s = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // Defensive truncation only for truly pathological lengths.
    if (s.length > HARD_STRING_CAP) {
      s = s.slice(0, HARD_STRING_CAP) + `…[+${s.length - HARD_STRING_CAP} chars]`;
    }
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
