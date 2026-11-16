/**
 * Stateful, query-aware in-memory Supabase test double.
 *
 * The stateless mock (src/test/mocks/supabase-factory.ts) returns mockQueryResult.data
 * verbatim and ignores filters — which forced the old campaign steps to re-implement
 * filter/sort themselves. This double instead maintains a real row store and honors the
 * query patterns the app actually issues, so steps can seed data and let the real hooks +
 * components do the querying, then assert on the rendered DOM.
 *
 * Scope is deliberately narrow — NOT a Postgres emulator. Supported per the patterns in
 * src/hooks/useCampaigns.ts (and close cousins):
 *   from(table).select(cols)
 *   .insert(row|rows).select().single()        // generates id / slug / timestamps
 *   .upsert(row|rows, { onConflict })          // update-on-key-match, else insert
 *   .update(patch).eq('id', x).select().single()
 *   .update(patch).eq('id', x)                 // awaited without select (archive)
 *   .delete().eq('id', x)
 *   .is(col, null) / .eq(col, val) / .in(col, [...]) / .order(col, {ascending})
 *   .not('sequence', 'in', '(0,1)') / .not('archived_at', 'is', null)
 *   .or('slug.eq.<v>,previous_slugs.cs.{"<v>"}') // slug-or-previous-slug lookup
 *   .single() / .maybeSingle()
 * Anything outside this set is a no-op filter and is marked with an UNSUPPORTED comment.
 */

export type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `row-${_seq}`;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base || 'campaign';
}

// DM-only / owner-only columns live in their own tables (AD-5, story 1.5). The real database creates
// the private row with an AFTER INSERT trigger and PostgREST embeds it with `character_private(...)`;
// this fake mirrors both so the real hooks run unchanged.
const PRIVATE_TABLES: Record<string, { table: string; fk: string; columns: readonly string[]; defaults: Row }> = {
  characters: { table: 'character_private', fk: 'character_id', columns: ['backstory', 'notes'], defaults: {} },
  sessions: {
    table: 'session_dm',
    fk: 'session_id',
    columns: ['notes', 'loot', 'experience_awarded'],
    defaults: { experience_awarded: 0 },
  },
};
const EMBED_PARENT: Record<string, { fk: string }> = {
  character_private: { fk: 'character_id' },
  session_dm: { fk: 'session_id' },
};
// Filters such as .eq('sessions.campaign_id', x) on session_dm (inner join through its session).
const PARENT_OF: Record<string, { parentTable: string; fk: string }> = {
  'session_dm.sessions': { parentTable: 'sessions', fk: 'session_id' },
};

export interface StatefulDb {
  /** Replace all rows in a table (timestamps/ids/slugs are taken as-is from the seed rows). */
  seed(table: string, rows: Row[]): void;
  /** Read the current rows of a table (for assertions). */
  rows(table: string): Row[];
  reset(): void;
}

interface QueryState {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  payload: Row | Row[] | null;
  /** Conflict-target columns for upsert; empty = always insert. */
  onConflict: string[];
  predicates: Predicate[];
  orderBy: { col: string; ascending: boolean } | null;
  wantSingle: boolean;
  wantMaybeSingle: boolean;
  embeds: string[];
}

function parseOr(expr: string): Predicate {
  // Only the slug-or-previous-slug form is supported:
  //   slug.eq.<v>,previous_slugs.cs.{"<v>"}
  const parts = expr.split(',');
  const checks: Predicate[] = [];
  for (const part of parts) {
    const eq = /^([a-z_]+)\.eq\.(.+)$/.exec(part);
    if (eq) {
      const [, col, val] = eq;
      checks.push((r) => String(r[col]) === val);
      continue;
    }
    const cs = /^([a-z_]+)\.cs\.\{"(.+)"\}$/.exec(part);
    if (cs) {
      const [, col, val] = cs;
      checks.push((r) => Array.isArray(r[col]) && (r[col] as unknown[]).includes(val));
      continue;
    }
    // UNSUPPORTED or() clause — ignored.
  }
  return (r) => checks.some((c) => c(r));
}

function makeStore() {
  const tables: Record<string, Row[]> = {};
  const get = (t: string): Row[] => (tables[t] ??= []);
  return { tables, get };
}

export function createStatefulSupabase(): { supabase: unknown; db: StatefulDb } {
  const store = makeStore();

  class Query implements PromiseLike<{ data: unknown; error: unknown }> {
    private s: QueryState;
    constructor(table: string) {
      this.s = {
        table,
        op: 'select',
        payload: null,
        onConflict: [],
        predicates: [],
        orderBy: null,
        wantSingle: false,
        wantMaybeSingle: false,
        embeds: [],
      };
    }
    select(cols?: string): this {
      if (typeof cols === 'string') {
        for (const m of cols.matchAll(/(\w+)\(/g)) {
          if (m[1] in EMBED_PARENT) this.s.embeds.push(m[1]);
        }
      }
      return this;
    }
    insert(payload: Row | Row[]): this {
      this.s.op = 'insert';
      this.s.payload = payload;
      return this;
    }
    update(payload: Row): this {
      this.s.op = 'update';
      this.s.payload = payload;
      return this;
    }
    upsert(payload: Row | Row[], opts?: { onConflict?: string }): this {
      this.s.op = 'upsert';
      this.s.payload = payload;
      this.s.onConflict = opts?.onConflict ? opts.onConflict.split(',').map((c) => c.trim()) : [];
      return this;
    }
    delete(): this {
      this.s.op = 'delete';
      return this;
    }
    eq(col: string, val: unknown): this {
      const dot = col.indexOf('.');
      if (dot > 0) {
        const link = PARENT_OF[`${this.s.table}.${col.slice(0, dot)}`];
        const parentCol = col.slice(dot + 1);
        if (link) {
          this.s.predicates.push((r) => {
            const parent = store.get(link.parentTable).find((p) => p.id === r[link.fk]);
            return parent?.[parentCol] === val;
          });
          return this;
        }
      }
      this.s.predicates.push((r) => r[col] === val);
      return this;
    }
    neq(col: string, val: unknown): this {
      this.s.predicates.push((r) => r[col] !== val);
      return this;
    }
    is(col: string, val: unknown): this {
      // .is('archived_at', null) → rows where the column is null/undefined
      this.s.predicates.push((r) => (val === null ? r[col] == null : r[col] === val));
      return this;
    }
    or(expr: string): this {
      this.s.predicates.push(parseOr(expr));
      return this;
    }
    not(col: string, op: string, val: unknown): this {
      if (op === 'in') {
        // val is a Postgres list literal like "(0,1)" → keep rows whose col is NOT in it.
        const set = new Set(
          String(val)
            .replace(/^\(|\)$/g, '')
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
        );
        this.s.predicates.push((r) => !set.has(String(r[col])));
      } else if (op === 'is' && val === null) {
        this.s.predicates.push((r) => r[col] != null);
      }
      // UNSUPPORTED not() operator — ignored.
      return this;
    }
    in(col: string, vals: readonly unknown[]): this {
      // .in('id', [...]) → keep rows whose col matches any of the listed values.
      const set = new Set(vals);
      this.s.predicates.push((r) => set.has(r[col]));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }): this {
      this.s.orderBy = { col, ascending: opts?.ascending ?? true };
      return this;
    }
    limit(): this {
      return this;
    }
    single(): this {
      this.s.wantSingle = true;
      return this;
    }
    maybeSingle(): this {
      this.s.wantMaybeSingle = true;
      return this;
    }

    private run(): { data: unknown; error: unknown } {
      const rows = store.get(this.s.table);
      try {
        if (this.s.op === 'insert') {
          const incoming = Array.isArray(this.s.payload) ? this.s.payload : [this.s.payload as Row];
          const now = '2024-01-01T00:00:00Z';
          const inserted = incoming.map((row) => {
            const name = typeof row.name === 'string' ? row.name : 'Campaign';
            return {
              id: nextId(),
              slug: slugify(name),
              previous_slugs: [],
              created_at: now,
              updated_at: now,
              archived_at: null,
              ...row,
            } as Row;
          });
          rows.push(...inserted);
          const priv = PRIVATE_TABLES[this.s.table];
          if (priv) {
            for (const row of inserted) store.get(priv.table).push({ [priv.fk]: row.id, ...priv.defaults });
          }
          return this.shape(inserted);
        }

        if (this.s.op === 'upsert') {
          const incoming = Array.isArray(this.s.payload) ? this.s.payload : [this.s.payload as Row];
          const now = '2024-01-01T00:00:00Z';
          const keys = this.s.onConflict;
          const upserted = incoming.map((row) => {
            const existing = keys.length > 0 ? rows.find((r) => keys.every((k) => r[k] === row[k])) : undefined;
            if (existing) {
              Object.assign(existing, row, { updated_at: now });
              return existing;
            }
            const created = { id: nextId(), created_at: now, updated_at: now, ...row } as Row;
            rows.push(created);
            return created;
          });
          return this.shape(upserted);
        }

        const matched = rows.filter((r) => this.s.predicates.every((p) => p(r)));

        if (this.s.op === 'update') {
          for (const r of matched) Object.assign(r, this.s.payload);
          return this.shape(matched);
        }
        if (this.s.op === 'delete') {
          store.tables[this.s.table] = rows.filter((r) => !matched.includes(r));
          return this.shape(matched);
        }

        // select
        let result = matched;
        if (this.s.orderBy) {
          const { col, ascending } = this.s.orderBy;
          // `last_activity_at` is a PostgREST computed field on campaigns (see migration
          // 20260607000000): most recent session date, falling back to created_at. Mirror
          // it here by reading the related sessions from the store so list-ordering tests
          // exercise the real sort key rather than a missing column.
          const valueFor = (r: Row): string => {
            if (col === 'last_activity_at') {
              const dates = store
                .get('sessions')
                .filter((s) => s.campaign_id === r.id)
                .map((s) => s.date as string | null)
                .filter((d): d is string => d != null)
                .map((d) => new Date(d).toISOString());
              if (dates.length > 0) return dates.reduce((max, d) => (d > max ? d : max));
              return new Date(r.created_at as string).toISOString();
            }
            return r[col] as string;
          };
          result = [...result].sort((a, b) => {
            const av = valueFor(a);
            const bv = valueFor(b);
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return ascending ? cmp : -cmp;
          });
        }
        return this.shape(result);
      } catch (error) {
        return { data: null, error };
      }
    }

    private shape(inputRows: Row[]): { data: unknown; error: unknown } {
      const rows = this.s.embeds.length
        ? inputRows.map((row) => {
            const out: Row = { ...row };
            for (const name of this.s.embeds) {
              const related = store.get(name).find((r) => r[EMBED_PARENT[name].fk] === row.id);
              out[name] = related ? { ...related } : null;
            }
            return out;
          })
        : inputRows;
      if (this.s.wantSingle) {
        if (rows.length !== 1) {
          return { data: null, error: { message: `expected exactly one row, got ${rows.length}`, code: 'PGRST116' } };
        }
        return { data: rows[0], error: null };
      }
      if (this.s.wantMaybeSingle) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    }

    then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  const supabase = {
    from(table: string) {
      return new Query(table);
    },
  };

  const db: StatefulDb = {
    seed(table, rows) {
      const priv = PRIVATE_TABLES[table];
      if (priv) {
        // Seeds written against the old flat shape: split the private columns into their table.
        const privateRows: Row[] = [];
        store.tables[table] = rows.map((r) => {
          const copy: Row = { ...r };
          const p: Row = { [priv.fk]: r.id, ...priv.defaults };
          for (const c of priv.columns) {
            if (c in copy) {
              p[c] = copy[c];
              delete copy[c];
            }
          }
          privateRows.push(p);
          return copy;
        });
        store.tables[priv.table] = privateRows;
        return;
      }
      store.tables[table] = rows.map((r) => ({ ...r }));
    },
    rows(table) {
      return store.get(table);
    },
    reset() {
      for (const k of Object.keys(store.tables)) delete store.tables[k];
    },
  };

  return { supabase, db };
}
