export interface RawMenuV3 {
  id?: string;
  name?: string;
  categories?: RawCategoryV3[];
  modifiers?: RawModifierGroupV3[];
  // ... other fields
}

export interface RawCategoryV3 {
  id: string;
  caption: string;
  notes?: string;
  enabled: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  items: RawItemV3[];
}

export interface RawItemV3 {
  id: string;
  caption: string;
  notes?: string;
  enabled: boolean;
  pricingProfiles: RawPricingProfileV3[];
  modifierMembers: { modifierId: string }[];
  imageUrl?: string;
  image?: string;
}

export interface RawPricingProfileV3 {
  collectionPrice?: number;
  deliveryPrice?: number;
  dineInPrice?: number;
  takeawayPrice?: number;
}

export interface RawModifierGroupV3 {
  id: string;
  caption: string;
  enabled: boolean;
  /** V3 export uses `min` / `max` on modifier groups */
  min?: number;
  max?: number;
  minSelectCount?: number;
  maxSelectCount?: number;
  items: RawModifierOptionV3[];
}

export interface RawModifierOptionV3 {
  id: string;
  caption: string;
  enabled: boolean;
  pricingProfiles: RawPricingProfileV3[];
  backgroundColor?: string;
  foregroundColor?: string;
}

// Normalized Types
export type SalesChannel = 'Collection' | 'Delivery' | 'DineIn' | 'Takeaway';

export interface NormalizedMenu {
  id: string;
  name: string;
  description?: string;
  categories: NormalizedCategory[];
  modifierGroups: Record<string, NormalizedModifierGroup>;
  channels: SalesChannel[];
  metadata: {
    sourceType: 'v3' | 'legacy' | 'admin' | 'flipdish_portal';
    itemCount: number;
    categoryCount: number;
    warnings: string[];
  };
}

export interface NormalizedCategory {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** POS category tile (from export) */
  backgroundColor?: string;
  foregroundColor?: string;
  items: NormalizedItem[];
}

export interface NormalizedItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  prices: Record<SalesChannel, number>;
  modifierGroupIds: string[];
  imageUrl?: string;
}

export interface NormalizedModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  options: NormalizedModifierOption[];
}

export interface NormalizedModifierOption {
  id: string;
  name: string;
  /** Primary display price (collection); prefer `prices[channel]` in UI */
  price: number;
  prices: Record<SalesChannel, number>;
  enabled: boolean;
  /** POS modifier tile (from export) */
  backgroundColor?: string;
  foregroundColor?: string;
}

/**
 * Which platforms this uploaded menu applies to (internal agent selection).
 * One or both may be true — multi-select when the menu is used everywhere.
 */
export interface ReviewProductScopes {
  webApp: boolean;
  pos: boolean;
}

export interface DemoStep {
  id: string;
  label: string;
  description: string;
  action:
    | 'goToScreen'
    | 'openCategory'
    | 'selectItem'
    | 'chooseModifier'
    | 'addToCart'
    | 'openCart'
    | 'goToCheckout'
    | 'chooseOrderType'
    /** Guided tour: highlight all category controls (web/app or POS). */
    | 'spotlightCategories'
    /** Guided tour: highlight items in the active category. */
    | 'spotlightItems'
    /** Guided tour: highlight modifier choices (opens sample item when needed). */
    | 'spotlightModifiers'
    /** Guided tour: add sample item to basket/ticket and highlight it. */
    | 'spotlightBasket';
  targetId?: string;
  /** For chooseModifier: pick only this group and merge into existing selections (multi-layer demos). */
  modifierGroupId?: string;
  delay?: number;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  type: 'customer' | 'staff';
  steps: DemoStep[];
}
