import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { PostgresAdapter } from "./adapters/postgres.js";
import { generateQuery } from "./ai/llm.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 30 }));

const MAX_ROWS = Number(process.env.MAX_ROWS ?? 200);
const db = new PostgresAdapter(process.env.DATABASE_URL!);

let schemaCache: Awaited<ReturnType<typeof db.getSchema>> | null = null;
const getSchema = async () => (schemaCache ??= await db.getSchema());

app.get("/api/schema", async (_req, res) => {
  try { res.json(await getSchema()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/query/generate", async (req, res) => {
  try {
    const { question, history } = req.body;
    if (typeof question !== "string" || !question.trim() || question.length > 500) {
      return res.status(400).json({ error: "Enter a question under 500 characters." });
    }
    const schema = await getSchema();
    const out = await generateQuery(question, schema, db.dialect, history);
    const check = db.validate(out.sql, schema);
    res.json({ ...out, sql: check.sql ?? out.sql, valid: check.ok, validationError: check.error });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/query/execute", async (req, res) => {
  try {
    const schema = await getSchema();
    // Always re-validate: the user may have edited the SQL in the editor.
    const check = db.validate(String(req.body.sql ?? ""), schema);
    if (!check.ok) return res.status(400).json({ error: check.error });
    res.json(await db.execute(check.sql!, { maxRows: MAX_ROWS }));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

const port = Number(process.env.PORT ?? 4000);
db.testConnection()
  .then(() => app.listen(port, () => console.log(`API on :${port}`)))
  .catch((e) => { console.error("DB connection failed:", e.message); process.exit(1); });
