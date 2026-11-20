import type { ResolvedCharacter } from '@/types/resolved';
import { getItemDef } from '@/lib/sources/items';
import type { TablesInsert } from '@/types/supabase';

/**
 * Builds the rows to insert into `character_items` from a resolved character.
 *
 * Items with the same itemId AND the same source are aggregated into a single
 * row (quantities summed). Items with the same itemId but different sources
 * produce separate rows — preserving the distinct provenance.
 *
 * Called once at finalize time. The idempotency guard (checking for existing
 * rows) lives in `useBuilderAutosave.finalize`.
 */
export function buildMaterializedItemRows(
  resolved: ResolvedCharacter,
  characterId: string
): readonly TablesInsert<'character_items'>[] {
  const grouped = new Map<string, { itemId: string; quantity: number; source: object }>();

  for (const item of resolved.equipment) {
    const key = `${item.itemId}::${JSON.stringify(item.source)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      grouped.set(key, { itemId: item.itemId, quantity: item.quantity, source: item.source as object });
    }
  }

  const rows: TablesInsert<'character_items'>[] = [];
  for (const { itemId, quantity, source } of grouped.values()) {
    rows.push({
      character_id: characterId,
      item_id: itemId,
      quantity,
      equipped: false,
      attuned: false,
      source: source as TablesInsert<'character_items'>['source'],
    });
  }

  return rows;
}

type ItemRow = TablesInsert<'character_items'>;

/**
 * Marks the worn gear of freshly materialized rows as equipped (2014 finalize): at most one body armor, at most one
 * shield, and weapons (melee first, in row order): two with free hands, one next to a shield, never a two-handed one
 * next to a shield. Rows whose item is unknown stay unequipped. Returns new rows, the input is not touched.
 */
export function autoEquipRows(rows: readonly ItemRow[]): readonly ItemRow[] {
  const defs = rows.map((row) => getItemDef(row.item_id));
  const armorIdx = defs.findIndex((d) => d?.type === 'armor' && d.category !== 'shield');
  const shieldIdx = defs.findIndex((d) => d?.type === 'armor' && d.category === 'shield');
  const hasShield = shieldIdx >= 0;
  const weaponIdx = defs
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d?.type === 'weapon' && !(hasShield && d.properties.includes('two-handed')))
    .sort(
      (a, b) =>
        Number(a.d?.type === 'weapon' && a.d.range === 'ranged') -
        Number(b.d?.type === 'weapon' && b.d.range === 'ranged')
    )
    .slice(0, hasShield ? 1 : 2)
    .map(({ i }) => i);
  const equip = new Set<number>([
    ...(armorIdx >= 0 ? [armorIdx] : []),
    ...(hasShield ? [shieldIdx] : []),
    ...weaponIdx,
  ]);
  return rows.map((row, i) => (equip.has(i) ? { ...row, equipped: true } : row));
}
