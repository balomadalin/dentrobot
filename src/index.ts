import "dotenv/config";
import { app } from "./app";
import { migrate } from "./db";
import { clinic } from "./clinic";

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
