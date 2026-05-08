// Sanitize a menu JSON before sending it to Claude.
//
// Strips noise fields, base64 image data, HTML tags, and very long strings so
// a typical Flipdish export fits inside Sonnet 4.5's 200K context window.
// Used by /api/analyze before serializing the menu into the prompt.

export const NOISE_KEYS = new Set([
  'createdAt', 'updatedAt', 'modifiedAt', 'deletedAt',
  'imageBase64', 'imageData', 'imageBlob',
  'rawHtml', 'rawHtmlContent', 'htmlBody', 'rawJson',
  'etag', 'hash', 'sha', 'signature',
]);

const MAX_STRING_LEN = 600;

export function slimMenu(v) {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (v.startsWith('data:image') || v.startsWith('data:application')) return '[binary]';
    let s = v;
    if (/<[a-z][^>]*>/i.test(s)) {
      s = s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (s.length > MAX_STRING_LEN) {
      s = s.slice(0, MAX_STRING_LEN) + `…[+${s.length - MAX_STRING_LEN} chars]`;
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
