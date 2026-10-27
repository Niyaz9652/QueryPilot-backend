import { Pool } from "pg";
import type { DbAdapter, SchemaInfo, QueryResult, ValidationResult } from "../types.js";
import { validateSelect } from "../validator/sql.js";

export class PostgresAdapter implements DbAdapter {
  dialect = "PostgreSQL";
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5, statement_timeout: 5000 });
  }

  async testConnection() {
    await this.pool.query("SELECT 1");
  }

  async getSchema(): Promise<SchemaInfo> {
    const cols = await this.pool.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
    );
    const fks = await this.pool.query(
      `SELECT c.conrelid::regclass::text AS table, a.attname AS column,
              c.confrelid::regclass::text AS ref_table, af.attname AS ref_column
       FROM pg_constraint c
       JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum = c.conkey[1]
       JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
       WHERE c.contype = 'f'`
    );
    const tables = new Map<string, { name: string; type: string }[]>();
    for (const r of cols.rows) {
      if (!tables.has(r.table_name)) tables.set(r.table_name, []);
      tables.get(r.table_name)!.push({ name: r.column_name, type: r.data_type });
    }
    return {
      tables: [...tables].map(([name, columns]) => ({ name, columns })),
      relationships: fks.rows.map((r) => ({
        table: r.table, column: r.column, refTable: r.ref_table, refColumn: r.ref_column,
      })),
    };
  }

  validate(query: string, schema: SchemaInfo): ValidationResult {
    return validateSelect(query, schema);
  }

  async execute(sql: string, { maxRows }: { maxRows: number }): Promise<QueryResult> {
    const client = await this.pool.connect();
    const start = Date.now();
    try {
      // Row cap enforced by us, not the LLM. Read-only transaction as a second guard.
      await client.query("BEGIN READ ONLY");
      const res = await client.query(`SELECT * FROM (${sql}) AS q LIMIT ${Number(maxRows)}`);
      return {
        columns: res.fields.map((f) => f.name),
        rows: res.rows,
        rowCount: res.rowCount ?? res.rows.length,
        ms: Date.now() - start,
      };
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }
}
