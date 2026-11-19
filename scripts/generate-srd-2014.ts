/**
 * Generates the 2014 SRD layer of the rules (story 9.5, docs/rules-as-data.md §10).
 *
 *   npm run srd:generate              converts the committed snapshot (no network) and writes src/lib/rules/srd-2014/
 *   npm run srd:generate -- --fetch   first refreshes the snapshot from the pinned upstream commit, then converts
 *   npm run srd:generate -- --check   converts and fails if the committed output differs (nothing is written)
 *
 * Deterministic: records and entries are sorted by id, the JSON is formatted by Prettier with the repository settings,
 * so two runs on the same snapshot write identical files. The app never fetches anything at run time: it imports the
 * generated JSON (`src/lib/rules/srd-2014.ts`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { convertSrd2014 } from './srd-2014/convert';
import {
  SNAPSHOT_FILES,
  sortRecords,
  upstreamUrl,
  type SnapshotName,
  type Snapshot,
  type SrdRecord,
} from './srd-2014/upstream';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_DIR = join(ROOT, 'scripts', 'srd-2014', 'snapshot');
const OUTPUT_DIR = join(ROOT, 'src', 'lib', 'rules', 'srd-2014');

async function formatJson(value: unknown, file: string): Promise<string> {
  const options = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(JSON.stringify(value), { ...options, filepath: file });
}

async function fetchSnapshot(): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  for (const [name, file] of Object.entries(SNAPSHOT_FILES) as [SnapshotName, string][]) {
    const res = await fetch(upstreamUrl(file));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const records = sortRecords((await res.json()) as SrdRecord[]);
    const target = join(SNAPSHOT_DIR, `${name}.json`);
    await writeFile(target, await formatJson(records, target), 'utf8');
    console.error(`snapshot ${name}: ${records.length} records`);
  }
}

async function readSnapshot(dir = SNAPSHOT_DIR): Promise<Snapshot> {
  const out: Partial<Record<SnapshotName, SrdRecord[]>> = {};
  for (const name of Object.keys(SNAPSHOT_FILES) as SnapshotName[]) {
    out[name] = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8')) as SrdRecord[];
  }
  return out as Snapshot;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--fetch')) await fetchSnapshot();
  const { entries, unexpressed } = convertSrd2014(await readSnapshot());
  await mkdir(OUTPUT_DIR, { recursive: true });
  let differs = false;
  for (const [kind, list] of Object.entries(entries)) {
    const target = join(OUTPUT_DIR, `${kind}.json`);
    const json = await formatJson(list, target);
    if (args.has('--check')) {
      const current = await readFile(target, 'utf8').catch(() => '');
      if (current !== json) {
        differs = true;
        console.error(`${kind}.json differs from the generator output`);
      }
    } else {
      await writeFile(target, json, 'utf8');
    }
    console.error(`${kind}: ${list?.length ?? 0} entries`);
  }
  console.error(`text only (no engine effect): ${unexpressed.length}`);
  for (const u of unexpressed) console.error(`  ${u.kind} ${u.id}: ${u.what}`);
  if (differs) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
