// Sanitize a menu JSON before sending it to Claude.
//
// Strips fields the model can't act on (image URLs, binary blobs, internal
// timestamps, sync plumbing, hashes) while preserving every item name,
// price, description, and modifier reference — so the model sees exactly
// the data a human would care about, with none of the catalog/CDN
// metadata that bloats Flipdish exports.

// Case-insensitive: we lowercase every incoming key before lookup, so this
// set only needs the lowercase form of each name (covers camelCase,
// snake_case, PascalCase variants in one entry).
export const NOISE_KEYS = new Set([
  // ── Timestamps & audit trail ────────────────────────────────────────────
  'createdat', 'updatedat', 'modifiedat', 'deletedat',
  'created_at', 'updated_at', 'modified_at', 'deleted_at',
  'createdon', 'updatedon', 'modifiedon', 'deletedon',
  'createdby', 'updatedby', 'modifiedby',
  'lastsyncedat', 'lastsyncat', 'lastupdated', 'lastmodified',
  'created', 'updated', 'modified',

  // ── Embedded binary / raw source blobs ──────────────────────────────────
  'imagebase64', 'imagedata', 'imageblob',
  'rawhtml', 'rawhtmlcontent', 'htmlbody', 'rawjson',

  // ── Image / media URLs ──────────────────────────────────────────────────
  // The model can't fetch URLs, so every one of these is pure token waste.
  // For large Flipdish menus image URLs are often 15–30% of the JSON bytes.
  'imageurl', 'image_url',
  'thumbnailurl', 'thumbnail_url',
  'heroimageurl', 'hero_image_url',
  'iconurl', 'icon_url',
  'bannerurl', 'banner_url',
  'photourl', 'photo_url',
  'coverimageurl', 'cover_image_url',
  'backgroundimageurl', 'background_image_url',
  'mediaurl', 'media_url',
  'logourl', 'logo_url',
  'pictureurl', 'picture_url',
  'avatarurl', 'avatar_url',
  'imagepath', 'image_path',
  'imagekey', 'image_key',

  // ── Sync / catalog plumbing ─────────────────────────────────────────────
  'syncstate', 'sync_state', 'syncstatus', 'sync_status',
  'tenantid', 'tenant_id', 'merchantid', 'merchant_id',
  'accountid', 'account_id', 'organizationid', 'organization_id',
  'orgid', 'org_id', 'ownerid', 'owner_id', 'workspaceid', 'workspace_id',

  // ── Hashes / signatures / checksums ─────────────────────────────────────
  'etag', 'hash', 'sha', 'signature', 'checksum', 'fingerprint',
]);

// Lower than before. Real item descriptions sit at 50–500 chars; even a
// generous menu blurb is rarely past 2K. 5K is plenty of headroom while
// still catching the truly pathological cases (embedded log dumps, full
// terms-of-service blobs accidentally stuffed into a description field).
const HARD_STRING_CAP = 5000;

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
      if (NOISE_KEYS.has(k.toLowerCase())) continue;
      out[k] = slimMenu(val);
    }
    return out;
  }
  return v;
}
