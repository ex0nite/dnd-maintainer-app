/**
 * Where the SRD 5.1 data comes from (docs/rules-as-data.md §2.1 and §10).
 *
 * The open SRD 5.1 data set of the `5e-database` project (one JSON file per entity, English). The generator reads a
 * snapshot of the records it converts, committed next to this file (`snapshot/`), so that a run without network gives
 * the same output every time. `--fetch` refreshes the snapshot from the pinned commit below; change the commit on
 * purpose, then review the diff of the snapshot AND of the generated entries.
 *
 * Content licence: the records are SRD 5.1 text (Wizards of the Coast, CC-BY-4.0, attribution in
 * `src/lib/rules/srd-2014/ATTRIBUTION.md`). Nothing outside the SRD may enter the snapshot.
 */

export const UPSTREAM = {
  repository: '5e-bits/5e-database',
  /** Pinned commit: the snapshot is the state of the data set at this commit. */
  commit: 'a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f',
  folder: 'src/2014/en',
} as const;

/** Snapshot file name (in `snapshot/`) → upstream file name. One per SRD record type the converters read. */
export const SNAPSHOT_FILES = {
  races: '5e-SRD-Races.json',
  subraces: '5e-SRD-Subraces.json',
  traits: '5e-SRD-Traits.json',
  backgrounds: '5e-SRD-Backgrounds.json',
  classes: '5e-SRD-Classes.json',
  levels: '5e-SRD-Levels.json',
  subclasses: '5e-SRD-Subclasses.json',
  features: '5e-SRD-Features.json',
  spells: '5e-SRD-Spells.json',
} as const;

export type SnapshotName = keyof typeof SNAPSHOT_FILES;

/** A record of the data set: every record has an `index` (kebab-case id) and a `name`. The rest is per type. */
export interface SrdRecord {
  readonly index: string;
  readonly name: string;
  readonly [key: string]: unknown;
}

export type Snapshot = Readonly<Record<SnapshotName, readonly SrdRecord[]>>;

export function upstreamUrl(file: string): string {
  // The URL is built here and used by the generator only, never by the app at run time.
  return ['https:', '', 'raw.githubusercontent.com', UPSTREAM.repository, UPSTREAM.commit, UPSTREAM.folder, file].join(
    '/'
  );
}

/** Records sorted by index: the snapshot does not depend on the upstream file order. */
export function sortRecords(records: readonly SrdRecord[]): SrdRecord[] {
  return [...records].sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
}
