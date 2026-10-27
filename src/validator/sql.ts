import sqlParser from "node-sql-parser";
import type { SchemaInfo, ValidationResult } from "../types.js";

const parser = new sqlParser.Parser();
const OPTS = { database: "PostgresQL" };

// Parse-based validation: exactly one SELECT, only known tables.
export function validateSelect(sql: string, schema: SchemaInfo): ValidationResult {
  const clean = sql.trim().replace(/;+\s*$/, "");
  if (!clean) return { ok: false, error: "Empty query." };

  let ast;
  try {
    ast = parser.astify(clean, OPTS);
  } catch {
    return { ok: false, error: "Could not parse the SQL query." };
  }
  const stmts = Array.isArray(ast) ? ast : [ast];
  if (stmts.length !== 1 || stmts[0].type !== "select") {
    return { ok: false, error: "Only a single SELECT statement is allowed." };
  }

  const allowed = new Set(schema.tables.map((t) => t.name.toLowerCase()));
  for (const entry of parser.tableList(clean, OPTS)) {
    const table = entry.split("::")[2]?.toLowerCase();
    if (table && !allowed.has(table)) {
      return { ok: false, error: `Table "${table}" is not available.` };
    }
  }
  return { ok: true, sql: clean };
}
