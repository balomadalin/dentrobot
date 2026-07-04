import { Router, Request, Response } from "express";
import { alreadyProcessed } from "../db";
import { handlePatientMessage } from "../services/agent";
import { sendWhatsAppText, markAsRead } from "../services/whatsapp";
import { clinic } from "../clinic";

export const webhookRouter = Router();

/** GET /webhook – verificarea webhook-ului de către Meta */
webhookRouter.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[webhook] Verified by Meta");
    res.status(200).send(challenge);
  } else {
    console.warn("[webhook] Verification failed");
    res.sendStatus(403);
  }
});

/** POST /webhook – mesaje primite de la pacienți */
webhookRouter.post("/", (req: Request, res: Response) => {
  // Răspundem imediat 200 ca Meta să nu retrimită; procesăm asincron.
  res.sendStatus(200);

  processWebhook(req.body).catch(err => console.error("[webhook] Processing error:", err));
});

async function processWebhook(body: any): Promise<void> {
  if (body?.object !== "whatsapp_business_account") return;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue; // ignorăm statusuri (delivered/read)

      for (const message of value.messages) {
        const from: string = message.from;
        const messageId: string = message.id;

        if (await alreadyProcessed(messageId)) {
          console.log(`[webhook] Duplicate message ${messageId}, skipping`);
          continue;
        }

        let text: string | null = null;
        if (message.type === "text") {
          text = message.text?.body ?? null;
        } else if (message.type === "button") {
          text = message.button?.text ?? null;
        } else if (message.type === "interactive") {
          text = message.interactive?.button_reply?.title
            ?? message.interactive?.list_reply?.title
            ?? null;
        }

        markAsRead(messageId).catch(() => {});

        if (!text) {
          await sendWhatsAppText(
            from,
            `Momentan pot procesa doar mesaje text 🙂 Pentru altele, vă rugăm să ne sunați la ${clinic.phone}.`
          );
          continue;
        }

        console.log(`[webhook] ${from}: ${text}`);
        try {
          const reply = await handlePatientMessage(from, text);
          await sendWhatsAppText(from, reply);
        } catch (err) {
          console.error("[webhook] Agent error:", err);
          await sendWhatsAppText(
            from,
            `Îmi pare rău, am o problemă tehnică momentan. Vă rugăm să ne sunați la ${clinic.phone}.`
          );
        }
      }
    }
  }
}
