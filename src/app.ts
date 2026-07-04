import express from "express";
import { webhookRouter } from "./routes/webhook";
import { migrate } from "./db";
import { clinic } from "./clinic";

export const app = express();
app.use(express.json());

// Migrația rulează o singură dată per instanță, înaintea primului request (compatibil serverless).
let migrationPromise: Promise<void> | null = null;
app.use(async (_req, _res, next) => {
  try {
    if (!migrationPromise) {
      migrationPromise = migrate().catch(err => {
        migrationPromise = null; // permite retry la următorul request
        throw err;
      });
    }
    await migrationPromise;
    next();
  } catch (err) {
    next(err);
  }
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "DentroBot", clinic: clinic.name });
});

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

// Diagnostic: arată ce variabile sunt configurate (fără a expune valorile)
app.get("/diag", (_req, res) => {
  res.json({
    database_url: !!process.env.DATABASE_URL,
    anthropic_api_key: !!process.env.ANTHROPIC_API_KEY,
    whatsapp_token: !!process.env.WHATSAPP_TOKEN,
    whatsapp_phone_number_id: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    whatsapp_verify_token: !!process.env.WHATSAPP_VERIFY_TOKEN || "default",
  });
});

app.use("/webhook", webhookRouter);

// Vercel (framework: express) cere un default export de tip funcție/server.
export default app;
