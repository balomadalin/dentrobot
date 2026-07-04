import "dotenv/config";
import express from "express";
import { migrate } from "./db";
import { webhookRouter } from "./routes/webhook";
import { clinic } from "./clinic";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "DentroBot", clinic: clinic.name });
});

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use("/webhook", webhookRouter);

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const required = ["DATABASE_URL", "ANTHROPIC_API_KEY", "WHATSAPP_VERIFY_TOKEN"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn(`[boot] ⚠️  Variabile de mediu lipsă: ${missing.join(", ")}`);
  }

  await migrate();
  app.listen(PORT, () => {
    console.log(`[boot] 🦷 DentroBot pornit pe portul ${PORT} pentru "${clinic.name}"`);
  });
}

main().catch(err => {
  console.error("[boot] Fatal:", err);
  process.exit(1);
});
