import type { BundleDef, ItemDef, SlotFilter } from '@/types/items';
import { ARMOR_CATALOG, getItemDef, WEAPON_CATALOG } from '@/lib/sources/items';

export const BUNDLE_CATALOG: readonly BundleDef[] = [
  // Barbarian starting equipment (2024 PHB, Option A): a single fixed package.
  {
    id: 'barbarian-loadout',
    category: 'loadout',
    contents: [
      { itemId: 'greataxe', quantity: 1 },
      { itemId: 'handaxe', quantity: 4 },
      { itemId: 'explorers-pack', quantity: 1 },
    ],
    slots: [],
  },
  {
    id: 'fighter-chainmail',
    category: 'loadout',
    contents: [{ itemId: 'chain-mail', quantity: 1 }],
    slots: [],
  },
  {
    id: 'fighter-archer-kit',
    category: 'loadout',
    contents: [
      { itemId: 'leather', quantity: 1 },
      { itemId: 'longbow', quantity: 1 },
      { itemId: 'arrows-20', quantity: 1 },
    ],
    slots: [],
  },
  {
    id: 'martial-weapon-and-shield',
    category: 'melee-weapon',
    contents: [],
    slots: [
      {
        slotKey: 'weapon',
        quantity: 1,
        filter: { kind: 'weapon', category: 'martial' },
      },
      {
        slotKey: 'shield',
        quantity: 1,
        filter: { kind: 'armor', category: 'shield' },
      },
    ],
  },
  {
    id: 'two-martial-weapons',
    category: 'melee-weapon',
    contents: [],
    slots: [
      {
        slotKey: 'weapon-1',
        quantity: 1,
        filter: { kind: 'weapon', category: 'martial' },
      },
      {
        slotKey: 'weapon-2',
        quantity: 1,
        filter: { kind: 'weapon', category: 'martial' },
      },
    ],
  },
  {
    id: 'light-crossbow-kit',
    category: 'ranged-weapon',
    contents: [
      { itemId: 'light-crossbow', quantity: 1 },
      { itemId: 'bolts-20', quantity: 1 },
    ],
    slots: [],
  },
  {
    id: 'two-handaxes',
    category: 'ranged-weapon',
    contents: [{ itemId: 'handaxe', quantity: 2 }],
    slots: [],
  },
  // Rogue starting equipment
  {
    id: 'rogue-loadout',
    category: 'loadout',
    contents: [
      { itemId: 'leather', quantity: 1 },
      { itemId: 'dagger', quantity: 2 },
      { itemId: 'thieves-tools', quantity: 1 },
    ],
    slots: [],
  },
  {
    id: 'rogue-rapier',
    category: 'melee-weapon',
    contents: [{ itemId: 'rapier', quantity: 1 }],
    slots: [],
  },
  {
    id: 'rogue-shortsword-melee',
    category: 'melee-weapon',
    contents: [{ itemId: 'shortsword', quantity: 1 }],
    slots: [],
  },
  {
    id: 'rogue-shortbow-kit',
    category: 'ranged-weapon',
    contents: [
      { itemId: 'shortbow', quantity: 1 },
      { itemId: 'arrows-20', quantity: 1 },
    ],
    slots: [],
  },
  {
    id: 'rogue-shortsword-ranged',
    category: 'ranged-weapon',
    contents: [{ itemId: 'shortsword', quantity: 1 }],
    slots: [],
  },
  // 2014 starting equipment (SRD 5.1 classes, story 9.7). One bundle per option of the SRD's "(a) ... or (b) ..." lines.
  {
    id: 'single-greataxe',
    category: 'melee-weapon',
    contents: [{ itemId: 'greataxe', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-rapier',
    category: 'melee-weapon',
    contents: [{ itemId: 'rapier', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-longsword',
    category: 'melee-weapon',
    contents: [{ itemId: 'longsword', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-mace',
    category: 'melee-weapon',
    contents: [{ itemId: 'mace', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-warhammer',
    category: 'melee-weapon',
    contents: [{ itemId: 'warhammer', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-scimitar',
    category: 'melee-weapon',
    contents: [{ itemId: 'scimitar', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-shortsword',
    category: 'melee-weapon',
    contents: [{ itemId: 'shortsword', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-quarterstaff',
    category: 'melee-weapon',
    contents: [{ itemId: 'quarterstaff', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-dagger',
    category: 'melee-weapon',
    contents: [{ itemId: 'dagger', quantity: 1 }],
    slots: [],
  },
  {
    id: 'two-shortswords',
    category: 'melee-weapon',
    contents: [{ itemId: 'shortsword', quantity: 2 }],
    slots: [],
  },
  {
    id: 'five-javelins',
    category: 'ranged-weapon',
    contents: [{ itemId: 'javelin', quantity: 5 }],
    slots: [],
  },
  {
    id: 'single-shield',
    category: 'armor',
    contents: [{ itemId: 'shield', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-scale-mail',
    category: 'armor',
    contents: [{ itemId: 'scale-mail', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-leather-armor',
    category: 'armor',
    contents: [{ itemId: 'leather', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-chain-mail',
    category: 'armor',
    contents: [{ itemId: 'chain-mail', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-lute',
    category: 'gear',
    contents: [{ itemId: 'lute', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-musical-instrument',
    category: 'gear',
    contents: [{ itemId: 'musical-instrument', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-component-pouch',
    category: 'gear',
    contents: [{ itemId: 'component-pouch', quantity: 1 }],
    slots: [],
  },
  {
    id: 'single-arcane-focus',
    category: 'gear',
    contents: [{ itemId: 'arcane-focus', quantity: 1 }],
    slots: [],
  },
  {
    id: 'any-simple-weapon',
    category: 'melee-weapon',
    contents: [],
    slots: [{ slotKey: 'weapon', quantity: 1, filter: { kind: 'weapon', category: 'simple' } }],
  },
  {
    id: 'any-simple-melee-weapon',
    category: 'melee-weapon',
    contents: [],
    slots: [{ slotKey: 'weapon', quantity: 1, filter: { kind: 'weapon', category: 'simple', range: 'melee' } }],
  },
  {
    id: 'any-martial-melee-weapon',
    category: 'melee-weapon',
    contents: [],
    slots: [{ slotKey: 'weapon', quantity: 1, filter: { kind: 'weapon', category: 'martial', range: 'melee' } }],
  },
  {
    id: 'two-simple-melee-weapons',
    category: 'melee-weapon',
    contents: [],
    slots: [
      { slotKey: 'weapon-1', quantity: 1, filter: { kind: 'weapon', category: 'simple', range: 'melee' } },
      { slotKey: 'weapon-2', quantity: 1, filter: { kind: 'weapon', category: 'simple', range: 'melee' } },
    ],
  },
];

export function getBundleDef(id: string): BundleDef | undefined {
  return BUNDLE_CATALOG.find((b) => b.id === id);
}

export function requireBundleDef(id: string): BundleDef {
  const bundle = getBundleDef(id);
  if (!bundle) throw new Error(`Unknown bundle id: "${id}"`);
  return bundle;
}

/** Returns the i18n key for a bundle's display name. */
export function getBundleNameKey(bundleId: string): `bundles.${string}.name` {
  return `bundles.${bundleId}.name`;
}

/**
 * Resolves a bundle or pack id to its fixed contents and kind.
 * Note: this ignores any bundle slots — callers that need slot-materialized items must
 * resolve them separately via `getItemsForSlot` and user slot picks.
 * Checks BUNDLE_CATALOG first, then falls back to pack-type items in ITEM_CATALOG.
 * Throws if the id is unknown or does not resolve to a bundle/pack.
 */
export function resolveBundleRef(id: string): {
  readonly contents: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly kind: 'bundle' | 'pack';
} {
  const bundle = getBundleDef(id);
  if (bundle) return { contents: bundle.contents, kind: 'bundle' };

  const item = getItemDef(id);
  if (item?.type === 'pack') return { contents: item.contents, kind: 'pack' };

  throw new Error(`Unknown bundle or pack id: "${id}"`);
}

/**
 * Returns every item from WEAPON_CATALOG / ARMOR_CATALOG that satisfies the given SlotFilter.
 * Used by the ChoicePicker slot UI to populate the Select dropdown for slotted bundles,
 * and by the resolver to validate persisted slot picks against the current catalog.
 */
export function getItemsForSlot(filter: SlotFilter): readonly ItemDef[] {
  if (filter.kind === 'weapon') {
    return WEAPON_CATALOG.filter((w) => {
      if (filter.category !== undefined && w.category !== filter.category) return false;
      if (filter.range !== undefined && w.range !== filter.range) return false;
      return true;
    });
  }
  // armor
  return ARMOR_CATALOG.filter((a) => a.category === filter.category);
}
