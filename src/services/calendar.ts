import { google } from "googleapis";
import { clinic } from "../clinic";

/**
 * Sincronizare Google Calendar prin Service Account.
 * Configurare:
 *  - GOOGLE_SERVICE_ACCOUNT_JSON = conținutul JSON al service account-ului (o singură linie)
 *  - GOOGLE_CALENDAR_ID = ID-ul calendarului (partajat cu email-ul service account-ului, cu drept de editare)
 * Dacă lipsesc, aplicația funcționează normal doar cu PostgreSQL.
 */

function getCalendarClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!raw || !calendarId) return null;

  try {
    const credentials = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    return { calendar: google.calendar({ version: "v3", auth }), calendarId };
  } catch (err) {
    console.error("[calendar] GOOGLE_SERVICE_ACCOUNT_JSON invalid:", err);
    return null;
  }
}

export async function createCalendarEvent(opts: {
  patientName: string;
  service: string;
  phone: string;
  startsAt: Date;
  durationMinutes: number;
}): Promise<string | null> {
  const client = getCalendarClient();
  if (!client) return null;

  try {
    const end = new Date(opts.startsAt.getTime() + opts.durationMinutes * 60 * 1000);
    const res = await client.calendar.events.insert({
      calendarId: client.calendarId,
      requestBody: {
        summary: `${opts.service} – ${opts.patientName}`,
        description: `Programare DentBot\nPacient: ${opts.patientName}\nTelefon: ${opts.phone}\nServiciu: ${opts.service}`,
        start: { dateTime: opts.startsAt.toISOString(), timeZone: clinic.timezone },
        end: { dateTime: end.toISOString(), timeZone: clinic.timezone },
      },
    });
    console.log("[calendar] Event created:", res.data.id);
    return res.data.id ?? null;
  } catch (err) {
    console.error("[calendar] Failed to create event:", err);
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const client = getCalendarClient();
  if (!client) return;
  try {
    await client.calendar.events.delete({ calendarId: client.calendarId, eventId });
    console.log("[calendar] Event deleted:", eventId);
  } catch (err) {
    console.error("[calendar] Failed to delete event:", err);
  }
}
