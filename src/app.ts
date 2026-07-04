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

app.use("/webhook", webhookRouter);

// Vercel (framework: express) cere un default export de tip funcție/server.
export default app;
