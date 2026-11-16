export type ColumnType = 'text' | 'jsonb' | 'text[]' | 'boolean' | 'integer' | 'timestamptz' | 'uuid' | 'date';

export type ExportData = Readonly<{
  campaigns: readonly Record<string, unknown>[];
  campaign_dm: readonly Record<string, unknown>[];
  characters: readonly Record<string, unknown>[];
  character_private: readonly Record<string, unknown>[];
  sessions: readonly Record<string, unknown>[];
  session_dm: readonly Record<string, unknown>[];
  encounters: readonly Record<string, unknown>[];
  notes: readonly Record<string, unknown>[];
  character_build_levels: readonly Record<string, unknown>[];
  character_items: readonly Record<string, unknown>[];
}>;

interface ColumnDef {
  readonly name: string;
  readonly type: ColumnType;
}

// Must match database schema in supabase/migrations/. Update when schema changes.
const TABLE_COLUMNS = {
  campaigns: [
    { name: 'id', type: 'uuid' },
    { name: 'slug', type: 'text' },
    { name: 'previous_slugs', type: 'text[]' },
    { name: 'name', type: 'text' },
    { name: 'description', type: 'text' },
    { name: 'setting', type: 'text' },
    { name: 'status', type: 'text' },
    { name: 'image_url', type: 'text' },
    { name: 'allowed_source_books', type: 'text[]' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  campaign_dm: [
    { name: 'campaign_id', type: 'uuid' },
    { name: 'dm_notes', type: 'text' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  character_private: [
    { name: 'character_id', type: 'uuid' },
    { name: 'backstory', type: 'text' },
    { name: 'notes', type: 'text' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  characters: [
    { name: 'id', type: 'uuid' },
    { name: 'slug', type: 'text' },
    { name: 'previous_slugs', type: 'text[]' },
    { name: 'campaign_id', type: 'uuid' },
    { name: 'name', type: 'text' },
    { name: 'character_type', type: 'text' },
    { name: 'player_name', type: 'text' },
    { name: 'species', type: 'text' },
    { name: 'class', type: 'text' },
    { name: 'subclass', type: 'text' },
    { name: 'level', type: 'integer' },
    { name: 'background', type: 'text' },
    { name: 'alignment', type: 'text' },
    { name: 'hit_points_max', type: 'integer' },
    { name: 'armor_class', type: 'integer' },
    { name: 'speed', type: 'integer' },
    { name: 'proficiency_bonus', type: 'integer' },
    { name: 'personality_traits', type: 'text' },
    { name: 'ideals', type: 'text' },
    { name: 'bonds', type: 'text' },
    { name: 'flaws', type: 'text' },
    { name: 'appearance', type: 'text' },
    { name: 'portrait_url', type: 'text' },
    { name: 'is_active', type: 'boolean' },
    { name: 'status', type: 'text' },
    { name: 'weapon_masteries', type: 'jsonb' },
    { name: 'heroic_inspiration', type: 'boolean' },
    { name: 'exhaustion_level', type: 'integer' },
    { name: 'conditions', type: 'text[]' },
    { name: 'hit_dice_used', type: 'jsonb' },
    { name: 'spell_slots_used', type: 'jsonb' },
    { name: 'gender', type: 'text' },
    { name: 'size', type: 'text' },
    { name: 'age', type: 'text' },
    { name: 'height', type: 'text' },
    { name: 'weight', type: 'text' },
    { name: 'eye_color', type: 'text' },
    { name: 'hair_color', type: 'text' },
    { name: 'skin_color', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  sessions: [
    { name: 'id', type: 'uuid' },
    { name: 'slug', type: 'text' },
    { name: 'previous_slugs', type: 'text[]' },
    { name: 'campaign_id', type: 'uuid' },
    { name: 'session_number', type: 'integer' },
    { name: 'name', type: 'text' },
    { name: 'date', type: 'date' },
    { name: 'summary', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  session_dm: [
    { name: 'session_id', type: 'uuid' },
    { name: 'notes', type: 'text' },
    { name: 'experience_awarded', type: 'integer' },
    { name: 'loot', type: 'jsonb' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  encounters: [
    { name: 'id', type: 'uuid' },
    { name: 'session_id', type: 'uuid' },
    { name: 'campaign_id', type: 'uuid' },
    { name: 'name', type: 'text' },
    { name: 'description', type: 'text' },
    { name: 'status', type: 'text' },
    { name: 'round', type: 'integer' },
    { name: 'combatants', type: 'jsonb' },
    { name: 'notes', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  notes: [
    { name: 'id', type: 'uuid' },
    { name: 'campaign_id', type: 'uuid' },
    { name: 'title', type: 'text' },
    { name: 'content', type: 'text' },
    { name: 'category', type: 'text' },
    { name: 'tags', type: 'text[]' },
    { name: 'is_pinned', type: 'boolean' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
  character_build_levels: [
    { name: 'id', type: 'uuid' },
    { name: 'character_id', type: 'uuid' },
    { name: 'sequence', type: 'integer' },
    { name: 'base_abilities', type: 'jsonb' },
    { name: 'ability_method', type: 'text' },
    { name: 'class_id', type: 'text' },
    { name: 'class_level', type: 'integer' },
    { name: 'subclass_id', type: 'text' },
    { name: 'asi_allocation', type: 'jsonb' },
    { name: 'feat_id', type: 'text' },
    { name: 'hp_roll', type: 'integer' },
    { name: 'choices', type: 'jsonb' },
    { name: 'deleted_at', type: 'timestamptz' },
    { name: 'created_at', type: 'timestamptz' },
  ],
  character_items: [
    { name: 'id', type: 'uuid' },
    { name: 'character_id', type: 'uuid' },
    { name: 'item_id', type: 'text' },
    { name: 'quantity', type: 'integer' },
    { name: 'equipped', type: 'boolean' },
    { name: 'attuned', type: 'boolean' },
    { name: 'source', type: 'jsonb' },
    { name: 'created_at', type: 'timestamptz' },
    { name: 'updated_at', type: 'timestamptz' },
  ],
} as const satisfies Readonly<Record<string, readonly ColumnDef[]>>;

type TableName = keyof typeof TABLE_COLUMNS;

// Order matters: parent tables before children for foreign key constraints
const TABLE_ORDER: readonly TableName[] = [
  'campaigns',
  'campaign_dm',
  'characters',
  'character_private',
  'sessions',
  'session_dm',
  'encounters',
  'notes',
  'character_build_levels',
  'character_items',
] as const satisfies readonly TableName[];

// Tables with non-standard unique constraints for ON CONFLICT
const CONFLICT_TARGETS: Partial<Record<TableName, string>> = {
  campaign_dm: '(campaign_id)',
  character_private: '(character_id)',
  session_dm: '(session_id)',
  character_build_levels: '(character_id, sequence)',
};

// Rows a trigger creates on its own (the empty `campaign_dm` row of a new campaign) must not hide the
// exported content: on conflict these columns are overwritten instead of skipped.
const UPDATE_ON_CONFLICT: Partial<Record<TableName, readonly string[]>> = {
  campaign_dm: ['dm_notes'],
  character_private: ['backstory', 'notes'],
  session_dm: ['notes', 'experience_awarded', 'loot'],
};

export function escapeSqlString(value: string): string {
  return value.replace(/\0/g, '').replace(/'/g, "''");
}

export function escapeSqlValue(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  switch (type) {
    case 'uuid':
    case 'text':
    case 'date':
    case 'timestamptz':
      return `'${escapeSqlString(String(value))}'`;

    case 'integer': {
      const num = Number(value);
      if (!Number.isFinite(num)) return 'NULL';
      return String(Math.trunc(num));
    }

    case 'boolean':
      return value ? 'TRUE' : 'FALSE';

    case 'jsonb': {
      const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
      return `'${escapeSqlString(jsonStr)}'::jsonb`;
    }

    case 'text[]': {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) {
        return 'ARRAY[]::text[]';
      }
      const elements = arr.map((el: unknown) => `'${escapeSqlString(String(el))}'`);
      return `ARRAY[${elements.join(', ')}]::text[]`;
    }

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled column type: ${_exhaustive}`);
    }
  }
}

export function buildInsertStatement(
  table: string,
  row: Record<string, unknown>,
  columns: readonly ColumnDef[],
  conflictTarget: string = '(id)',
  updateColumns: readonly string[] = []
): string {
  const colNames = columns.map((c) => c.name).join(', ');
  const conflictAction =
    updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`
      : 'DO NOTHING';
  const values = columns.map((c) => escapeSqlValue(row[c.name], c.type)).join(', ');
  return `INSERT INTO ${table} (${colNames}) VALUES (${values}) ON CONFLICT ${conflictTarget} ${conflictAction};`;
}

export function generateSeedSql(data: ExportData): string {
  const lines: string[] = [
    '-- D&D Campaign Manager - Seed Data Export',
    `-- Generated at: ${new Date().toISOString()}`,
    '-- WARNING: This file uses ON CONFLICT ... DO NOTHING (DM notes: DO UPDATE). It is designed for',
    '-- restoring into a clean database. Partial restores into an existing database',
    '-- may fail if parent records (campaigns) are missing.',
    '',
    'SET standard_conforming_strings = ON;',
    '',
    'BEGIN;',
    '',
  ];

  for (const table of TABLE_ORDER) {
    const rows = data[table];
    if (!rows || rows.length === 0) {
      continue;
    }

    const columns = TABLE_COLUMNS[table];
    const conflictTarget = CONFLICT_TARGETS[table] ?? '(id)';
    lines.push(`-- ${table}`);
    for (const row of rows) {
      lines.push(
        buildInsertStatement(table, row as Record<string, unknown>, columns, conflictTarget, UPDATE_ON_CONFLICT[table])
      );
    }
    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}

export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
