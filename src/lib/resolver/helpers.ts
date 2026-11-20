import type { Grant } from '@/types/grants';
import type { GrantBundle, SourceTag } from '@/types/sources';
import type { ClassId } from '@/lib/dnd-helpers';

export type TaggedGrant<G extends Grant> = {
  readonly grant: G;
  readonly source: SourceTag;
};

// Counts the distinct class levels of the class-origin bundles: collectBundles emits one bundle per class level, and the
// bundles an expanded choice adds (feature picks, pact boon) carry the level of the grant, so they do not count twice.
export function getClassLevel(bundles: readonly GrantBundle[], classId: ClassId): number {
  const levels = new Set<number>();
  for (const b of bundles) {
    if (b.source.origin === 'class' && b.source.id === classId) levels.add(b.source.level);
  }
  return levels.size;
}

/** Spells the features of the bundles add to the lists of classes (`spell-list-extension` grants), per list. */
export function spellListExtensions(
  bundles: readonly GrantBundle[]
): readonly { readonly spellList: ClassId; readonly spellIds: readonly string[] }[] {
  const byList = new Map<ClassId, Set<string>>();
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type !== 'spell-list-extension') continue;
      const set = byList.get(grant.spellList) ?? new Set<string>();
      for (const id of grant.spellIds) set.add(id);
      byList.set(grant.spellList, set);
    }
  }
  return [...byList.entries()].map(([spellList, ids]) => ({ spellList, spellIds: [...ids] }));
}

/** The extra spells of one list. */
export function extraSpellIdsOf(bundles: readonly GrantBundle[], spellList: string): readonly string[] {
  return spellListExtensions(bundles).find((e) => e.spellList === spellList)?.spellIds ?? [];
}

type GrantByType = { [G in Grant as G['type']]: G };

export function collectGrantsByType<T extends Grant['type']>(
  bundles: readonly GrantBundle[],
  type: T
): readonly { grant: GrantByType[T]; source: SourceTag }[] {
  const result: { grant: GrantByType[T]; source: SourceTag }[] = [];
  for (const bundle of bundles) {
    for (const grant of bundle.grants) {
      if (grant.type === type) {
        result.push({ grant: grant as GrantByType[T], source: bundle.source });
      }
    }
  }
  return result;
}
