import type {
  NormalizedMenu,
  NormalizedCategory,
  NormalizedItem,
  NormalizedModifierGroup,
  NormalizedModifierOption,
  RawMenuV3,
  RawCategoryV3,
  RawItemV3,
  RawModifierGroupV3,
  RawModifierOptionV3,
  SalesChannel
} from '../../types';

export { isAdminMenuExport, normalizeAdminMenuExport } from './adminExport';
export { isFlipdishPortalMenu, normalizeFlipdishPortalMenu } from './flipdishPortal';
export { freshUploadId } from './freshUploadId';
import { freshUploadId } from './freshUploadId';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** V3 exports are usually camelCase; some pipelines use PascalCase or British spelling. */
function pickExportColor(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length > 0) return normalizeMenuColorToken(t);
    }
  }
  return undefined;
}

function normalizeMenuColorToken(s: string): string {
  if (/^#[0-9A-Fa-f]{3}$/i.test(s) || /^#[0-9A-Fa-f]{6}$/i.test(s) || /^#[0-9A-Fa-f]{8}$/i.test(s)) {
    return s;
  }
  if (/^[0-9A-Fa-f]{6}$/i.test(s)) return `#${s}`;
  if (/^[0-9A-Fa-f]{3}$/i.test(s)) return `#${s}`;
  return s;
}

function resolveRawCategories(raw: RawMenuV3): RawCategoryV3[] {
  if (Array.isArray(raw.categories) && raw.categories.length > 0) {
    return raw.categories;
  }
  const root = asRecord(raw);
  if (!root) return raw.categories ?? [];
  const menu = asRecord(root.menu) ?? asRecord(root.Menu);
  if (!menu) return raw.categories ?? [];
  const nested = menu.categories ?? menu.Categories;
  return Array.isArray(nested) ? (nested as RawCategoryV3[]) : (raw.categories ?? []);
}

export function normalizeV3Menu(raw: RawMenuV3): NormalizedMenu {
  const warnings: string[] = [];
  
  // Build modifier group map first
  const modifierGroups: Record<string, NormalizedModifierGroup> = {};
  (raw.modifiers || []).forEach(mod => {
    modifierGroups[mod.id] = normalizeModifierGroup(mod);
  });

  const categories: NormalizedCategory[] = resolveRawCategories(raw).map((cat) =>
    normalizeCategory(cat, warnings),
  );
  const itemCount = categories.reduce((acc, cat) => acc + cat.items.length, 0);

  // Detect available channels from first item's pricing profile if possible
  const channels: SalesChannel[] = ['Collection', 'Delivery', 'DineIn', 'Takeaway'];

  return {
    id: freshUploadId(),
    name: raw.name || 'Unnamed Menu',
    categories,
    modifierGroups,
    channels,
    metadata: {
      sourceType: 'v3',
      itemCount,
      categoryCount: categories.length,
      warnings
    }
  };
}

function pickStringField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return undefined;
}

function pickBooleanField(obj: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'boolean') return v;
  }
  return fallback;
}

function normalizeCategory(cat: RawCategoryV3, warnings: string[]): NormalizedCategory {
  const o = cat as unknown as Record<string, unknown>;
  const id = pickStringField(o, 'id', 'Id') ?? cat.id;
  const name = pickStringField(o, 'caption', 'Caption') ?? cat.caption;
  const description = pickStringField(o, 'notes', 'Notes') ?? cat.notes;
  const enabled = pickBooleanField(o, ['enabled', 'Enabled'], cat.enabled);
  const itemsRaw = (Array.isArray(o.items) ? o.items : Array.isArray(o.Items) ? o.Items : cat.items) ?? [];

  const bg =
    pickExportColor(
      o,
      'backgroundColor',
      'BackgroundColor',
      'background_colour',
      'BackgroundColour',
    ) ?? cat.backgroundColor;
  const fg =
    pickExportColor(
      o,
      'foregroundColor',
      'ForegroundColor',
      'foreground_colour',
      'ForegroundColour',
    ) ?? cat.foregroundColor;

  return {
    id,
    name,
    description,
    enabled,
    backgroundColor: bg,
    foregroundColor: fg,
    items: itemsRaw.map((item) => normalizeItem(item as RawItemV3, warnings)),
  };
}

function normalizeItem(item: RawItemV3, _warnings: string[]): NormalizedItem {
  const prices: Record<SalesChannel, number> = {
    Collection: item.pricingProfiles?.[0]?.collectionPrice || 0,
    Delivery: item.pricingProfiles?.[0]?.deliveryPrice || 0,
    DineIn: item.pricingProfiles?.[0]?.dineInPrice || 0,
    Takeaway: item.pricingProfiles?.[0]?.takeawayPrice || 0
  };

  const rawImage = item.imageUrl || item.image;
  return {
    id: item.id,
    name: item.caption,
    description: item.notes,
    enabled: item.enabled,
    prices,
    imageUrl: typeof rawImage === 'string' && rawImage.length > 0 ? rawImage : undefined,
    modifierGroupIds: (item.modifierMembers || []).map((m) => m.modifierId),
  };
}

function normalizeModifierGroup(mod: RawModifierGroupV3): NormalizedModifierGroup {
  const rawMin = mod.min ?? mod.minSelectCount;
  const rawMax = mod.max ?? mod.maxSelectCount;
  const min =
    rawMin != null && !Number.isNaN(Number(rawMin)) ? Math.max(0, Math.floor(Number(rawMin))) : 0;

  const enabledOptions = (mod.items || []).filter((i) => i.enabled);
  const optionCount = enabledOptions.length;

  let max: number;
  if (rawMax != null && !Number.isNaN(Number(rawMax))) {
    max = Math.max(0, Math.floor(Number(rawMax)));
  } else if (optionCount > 0) {
    max = optionCount;
  } else {
    max = min > 0 ? min : 1;
  }

  if (max < min) {
    max = min;
  }

  return {
    id: mod.id,
    name: mod.caption,
    isRequired: min > 0,
    minSelection: min,
    maxSelection: max,
    options: (mod.items || []).map((opt) => normalizeModifierOption(opt)),
  };
}

function normalizeModifierOption(opt: RawModifierOptionV3): NormalizedModifierOption {
  const pp = opt.pricingProfiles?.[0];
  const prices: Record<SalesChannel, number> = {
    Collection: pp?.collectionPrice ?? 0,
    Delivery: pp?.deliveryPrice ?? 0,
    DineIn: pp?.dineInPrice ?? 0,
    Takeaway: pp?.takeawayPrice ?? 0,
  };
  const o = opt as unknown as Record<string, unknown>;
  const bg =
    pickExportColor(
      o,
      'backgroundColor',
      'BackgroundColor',
      'background_colour',
      'BackgroundColour',
    ) ?? opt.backgroundColor;
  const fg =
    pickExportColor(
      o,
      'foregroundColor',
      'ForegroundColor',
      'foreground_colour',
      'ForegroundColour',
    ) ?? opt.foregroundColor;

  return {
    id: opt.id,
    name: opt.caption,
    price: prices.Collection,
    prices,
    enabled: opt.enabled,
    backgroundColor: bg,
    foregroundColor: fg,
  };
}

export function normalizeLegacyMenu(text: string): NormalizedMenu {
  const warnings: string[] = ["Legacy menu format detected. Parsing is experimental."];
  
  // Basic legacy parser logic: split by lines, look for categories and items
  const lines = text.split('\n');
  const categories: NormalizedCategory[] = [];
  let currentCategory: NormalizedCategory | null = null;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Very basic heuristic: if line is all caps and no price, it's a category
    if (trimmed === trimmed.toUpperCase() && !trimmed.includes('£') && !trimmed.includes('€')) {
      currentCategory = {
        id: `cat-${categories.length}`,
        name: trimmed,
        enabled: true,
        items: []
      };
      categories.push(currentCategory);
    } else if (currentCategory) {
      // Assume it's an item
      const priceMatch = trimmed.match(/[£€]?\s*(\d+\.\d{2})/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      const name = trimmed.replace(/[£€]?\s*\d+\.\d{2}/, '').trim();

      currentCategory.items.push({
        id: `item-${currentCategory.items.length}`,
        name,
        enabled: true,
        prices: { Collection: price, Delivery: price, DineIn: price, Takeaway: price },
        modifierGroupIds: []
      });
    }
  });

  return {
    id: freshUploadId(),
    name: 'Legacy Menu Export',
    categories,
    modifierGroups: {},
    channels: ['Collection', 'Takeaway'],
    metadata: {
      sourceType: 'legacy',
      itemCount: categories.reduce((acc, cat) => acc + cat.items.length, 0),
      categoryCount: categories.length,
      warnings
    }
  };
}
