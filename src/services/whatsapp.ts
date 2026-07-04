/**
 * Meta WhatsApp Cloud API – trimitere mesaje.
 * Necesită: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("[whatsapp] WHATSAPP_TOKEN sau WHATSAPP_PHONE_NUMBER_ID lipsesc. Mesaj netrimis către", to);
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: body.slice(0, 4096) },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[whatsapp] Send failed (${res.status}):`, err);
  } else {
    console.log(`[whatsapp] Message sent to ${to}`);
  }
}

/** Marchează mesajul primit ca citit (bifele albastre). Best-effort. */
export async function markAsRead(messageId: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    });
  } catch {
    /* non-critic */
  }
}
