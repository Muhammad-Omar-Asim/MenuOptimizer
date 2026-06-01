import type { NormalizedItem, NormalizedMenu, NormalizedModifierGroup, SalesChannel } from '../../types';

/** Ordered modifier groups attached to an item (skips missing / disabled-empty where possible). */
export function modifierGroupsForItem(
  menu: NormalizedMenu,
  item: NormalizedItem,
): NormalizedModifierGroup[] {
  const list: NormalizedModifierGroup[] = [];
  for (const gid of item.modifierGroupIds) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    const enabledOpts = g.options.filter((o) => o.enabled);
    if (enabledOpts.length === 0) continue;
    list.push(g);
  }
  return list;
}

/** Greedy default: first `minSelection` enabled options per group (for demos / fallbacks). */
export function buildDefaultModifierSelections(
  menu: NormalizedMenu,
  item: NormalizedItem,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const gid of item.modifierGroupIds) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    const enabled = g.options.filter((o) => o.enabled);
    const take = Math.min(g.minSelection, enabled.length);
    out[gid] = enabled.slice(0, take).map((o) => o.id);
  }
  return out;
}

export function modifierGroupStepValid(
  group: NormalizedModifierGroup,
  selections: Record<string, string[]>,
): boolean {
  const count = (selections[group.id] ?? []).length;
  return count >= group.minSelection && count <= group.maxSelection;
}

export function modifierExtrasTotal(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]>,
  channel: SalesChannel,
): number {
  let sum = 0;
  for (const gid of item.modifierGroupIds) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    const chosen = selections[gid] ?? [];
    for (const oid of chosen) {
      const opt = g.options.find((o) => o.id === oid);
      if (opt) sum += opt.prices[channel] ?? opt.price;
    }
  }
  return sum;
}

export function lineTotal(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]>,
  channel: SalesChannel,
): number {
  return (item.prices[channel] ?? 0) + modifierExtrasTotal(menu, item, selections, channel);
}

export function modifiersValidForItem(
  menu: NormalizedMenu,
  item: NormalizedItem,
  selections: Record<string, string[]>,
): boolean {
  for (const gid of item.modifierGroupIds) {
    const g = menu.modifierGroups[gid];
    if (!g) continue;
    const count = (selections[gid] ?? []).length;
    if (count < g.minSelection || count > g.maxSelection) return false;
  }
  return true;
}
