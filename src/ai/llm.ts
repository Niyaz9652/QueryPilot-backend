import type { SchemaInfo } from "../types.js";

export interface GenerateOutput {
  sql: string;
  explanation: string;
  chart: { type: "bar" | "line" | "none"; x?: string; y?: string };
}
export interface Turn { question: string; sql: string }

function schemaToText(s: SchemaInfo) {
  const tables = s.tables
    .map((t) => `${t.name}(${t.columns.map((c) => `${c.name} ${c.type}`).join(", ")})`)
    .join("\n");
  const rels = s.relationships
    .map((r) => `${r.table}.${r.column} -> ${r.refTable}.${r.refColumn}`)
    .join("\n");
  return `TABLES:\n${tables}\n\nRELATIONSHIPS:\n${rels}`;
}

export async function generateQuery(
  question: string, schema: SchemaInfo, dialect: string, history: Turn[] = []
): Promise<GenerateOutput> {
  const system = `You convert questions into a single read-only ${dialect} SELECT query.
Rules:
- Use ONLY the tables and columns in the schema below.
- Output exactly one SELECT statement. No CTEs, no INSERT/UPDATE/DELETE/DDL.
- Give computed columns clear aliases.
- Treat follow-up questions as refinements of the previous query when appropriate.
- Respond ONLY with JSON: {"sql": string, "explanation": string (plain English, 1-2 sentences),
  "chart": {"type": "bar"|"line"|"none", "x": column alias, "y": numeric column alias}}.
  Use "line" for time series, "bar" for category comparisons, otherwise "none".

${schemaToText(schema)}`;

  const contents = history.slice(-4).flatMap((t) => [
    { role: "user", parts: [{ text: t.question }] },
    { role: "model", parts: [{ text: JSON.stringify({ sql: t.sql }) }] },
  ]);
  contents.push({ role: "user", parts: [{ text: question }] });

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    }
  );
  if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
  const data: any = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = JSON.parse(text);
  return {
    sql: String(parsed.sql ?? ""),
    explanation: String(parsed.explanation ?? ""),
    chart: parsed.chart ?? { type: "none" },
  };
}
