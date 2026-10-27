export interface TableInfo {
  name: string;
  columns: { name: string; type: string }[];
}
export interface SchemaInfo {
  tables: TableInfo[];
  relationships: { table: string; column: string; refTable: string; refColumn: string }[];
}
export interface ValidationResult { ok: boolean; error?: string; sql?: string }
export interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; ms: number }

// Every database engine (Postgres, MySQL, Mongo...) implements this.
export interface DbAdapter {
  dialect: string;
  testConnection(): Promise<void>;
  getSchema(): Promise<SchemaInfo>;
  validate(query: string, schema: SchemaInfo): ValidationResult;
  execute(query: string, opts: { maxRows: number }): Promise<QueryResult>;
}
