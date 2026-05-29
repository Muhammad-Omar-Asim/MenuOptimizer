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

  // ── Secondary IDs ───────────────────────────────────────────────────────
  // The audit prompt only uses the primary `id` field for modifier
  // cross-reference. Internal/external/POS/legacy IDs are pure plumbing
  // and can be huge across thousands of items.
  'internalid', 'internal_id',
  'externalid', 'external_id',
  'posid', 'pos_id', 'positemid', 'pos_item_id',
  'legacyid', 'legacy_id',
  'erpid', 'erp_id',
  'sourceid', 'source_id',
  'globalid', 'global_id',
  'shortid', 'short_id',
  'publicid', 'public_id',
  'productcode', 'product_code', 'sku',
  'barcode', 'plu',

  // ── Translations / localisation ─────────────────────────────────────────
  // Multi-language menus duplicate every name/description across N locales.
  // The audit is in English — drop the rest entirely.
  'translations', 'translatedfields', 'translated_fields',
  'localizations', 'localisations',
  'i18n', 'locales', 'localecontent', 'locale_content',
  'translatedname', 'translated_name',
  'translateddescription', 'translated_description',

  // ── Nutrition / allergen / dietary ──────────────────────────────────────
  // Large structured per-item blobs not used by the audit prompt's
  // analytical sections.
  'nutrition', 'nutritionfacts', 'nutrition_facts',
  'nutritioninfo', 'nutrition_info', 'nutritionalinfo', 'nutritional_info',
  'allergens', 'allergeninfo', 'allergen_info',
  'dietary', 'dietaryinfo', 'dietary_info',
  'dietaryconfiguration', 'dietary_configuration',
  'macros', 'caloriebreakdown', 'calorie_breakdown',
  'kcal', 'energykj', 'energy_kj',

  // ── Availability / scheduling ───────────────────────────────────────────
  // Weekly windows / day-of-week schedules — large arrays, not used by the
  // audit (CSVs provide the actual traffic data).
  'availability', 'availabilitywindow', 'availability_window',
  'availabilityschedule', 'availability_schedule',
  'schedule', 'schedules',
  'opentimes', 'open_times', 'openinghours', 'opening_hours',
  'unavailabletimes', 'unavailable_times',
  'datestart', 'dateend', 'date_start', 'date_end',
  'startdate', 'enddate', 'start_date', 'end_date',
]);

// Aggressive cap. Real item descriptions sit at 50–500 chars; even a
// generous menu blurb fits in 800. Hard-truncating here catches the
// pathological cases (embedded HTML, log dumps, full terms-of-service
// pasted into description fields) and is the highest-leverage knob for
// shrinking a multi-megabyte Flipdish export.
const HARD_STRING_CAP = 800;

// Returns true if an object looks like a disabled / archived menu item
// that won't contribute to the audit. We skip these entirely so the
// model isn't asked to analyse decommissioned products.
function isDisabledItem(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (obj.enabled === false) return true;
  if (obj.isEnabled === false) return true;
  if (obj.disabled === true) return true;
  if (obj.isDisabled === true) return true;
  if (obj.isActive === false) return true;
  if (obj.active === false) return true;
  if (obj.isAvailable === false) return true;
  if (obj.available === false) return true;
  if (obj.isDeleted === true) return true;
  if (obj.deleted === true) return true;
  if (obj.archived === true) return true;
  if (obj.isArchived === true) return true;
  // Truthy soft-delete timestamp
  if (obj.deletedAt || obj.deleted_at || obj.archivedAt || obj.archived_at) return true;
  return false;
}

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
    // Hard truncation — applies to any string over 800 chars. See
    // HARD_STRING_CAP comment above for rationale.
    if (s.length > HARD_STRING_CAP) {
      s = s.slice(0, HARD_STRING_CAP) + `…[+${s.length - HARD_STRING_CAP} chars]`;
    }
    return s;
  }
  if (Array.isArray(v)) {
    // Filter out disabled items as we walk — saves token cost on every
    // archived product the export forgot to prune.
    return v
      .map(slimMenu)
      .filter(x => x !== undefined);
  }
  if (typeof v === 'object') {
    if (isDisabledItem(v)) return undefined;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (NOISE_KEYS.has(k.toLowerCase())) continue;
      out[k] = slimMenu(val);
    }
    return out;
  }
  return v;
}
