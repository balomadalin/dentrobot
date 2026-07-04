import { clinic } from "../clinic";
import * as db from "../db";
import { createCalendarEvent, deleteCalendarEvent } from "./calendar";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Offset-ul (ms) al fusului orar al clinicii față de UTC, la o dată dată. */
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: clinic.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

/** Convertește "YYYY-MM-DD" + "HH:mm" (ora clinicii) într-un Date UTC corect. */
export function clinicTimeToDate(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // ajustăm cu offsetul fusului la acea dată (corect inclusiv la DST)
  const offset = tzOffsetMs(naive);
  return new Date(naive.getTime() - offset);
}

export function formatInClinicTz(date: Date): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: clinic.timezone,
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function dayKeyFor(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export async function getAvailableSlots(dateStr: string, durationMinutes: number): Promise<string[]> {
  const hours = clinic.schedule[dayKeyFor(dateStr)];
  if (!hours) return []; // închis

  const dayStart = clinicTimeToDate(dateStr, "00:00");
  const dayEnd = clinicTimeToDate(dateStr, "23:59");
  const existing = await db.getAppointmentsForDay(dayStart, dayEnd);

  const openMin = toMinutes(hours.open);
  const closeMin = toMinutes(hours.close);
  const now = new Date();
  const slots: string[] = [];

  for (let m = openMin; m + durationMinutes <= closeMin; m += clinic.slotMinutes) {
    const slotStart = clinicTimeToDate(dateStr, fromMinutes(m));
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

    if (slotStart <= now) continue; // nu oferim sloturi din trecut

    const overlaps = existing.some(a => {
      const aStart = new Date(a.starts_at);
      const aEnd = new Date(aStart.getTime() + a.duration_minutes * 60 * 1000);
      return slotStart < aEnd && slotEnd > aStart;
    });
    if (!overlaps) slots.push(fromMinutes(m));
  }
  return slots;
}

export async function bookAppointment(opts: {
  phone: string;
  patientName: string;
  service: string;
  dateStr: string;
  timeStr: string;
}): Promise<{ ok: boolean; message: string }> {
  const svc = clinic.services.find(s => s.name.toLowerCase().includes(opts.service.toLowerCase().slice(0, 10)))
    ?? { name: opts.service, durationMinutes: clinic.slotMinutes, price: "" };

  const available = await getAvailableSlots(opts.dateStr, svc.durationMinutes);
  if (!available.includes(opts.timeStr)) {
    return {
      ok: false,
      message: `Slotul ${opts.timeStr} nu este disponibil pe ${opts.dateStr}. Sloturi libere: ${available.length ? available.join(", ") : "niciunul (zi închisă sau complet ocupată)"}`,
    };
  }

  const startsAt = clinicTimeToDate(opts.dateStr, opts.timeStr);
  const eventId = await createCalendarEvent({
    patientName: opts.patientName,
    service: svc.name,
    phone: opts.phone,
    startsAt,
    durationMinutes: svc.durationMinutes,
  });

  const appt = await db.createAppointment({
    phone: opts.phone,
    patient_name: opts.patientName,
    service: svc.name,
    starts_at: startsAt,
    duration_minutes: svc.durationMinutes,
    google_event_id: eventId,
  });

  return {
    ok: true,
    message: `Programare confirmată (ID #${appt.id}): ${svc.name} pentru ${opts.patientName}, ${formatInClinicTz(startsAt)}.`,
  };
}

export async function listMyAppointments(phone: string): Promise<string> {
  const appts = await db.getUpcomingAppointments(phone);
  if (!appts.length) return "Nu există programări viitoare pentru acest număr de telefon.";
  return appts
    .map(a => `#${a.id}: ${a.service} – ${formatInClinicTz(new Date(a.starts_at))} (${a.patient_name})`)
    .join("\n");
}

export async function cancelAppointment(id: number, phone: string): Promise<{ ok: boolean; message: string }> {
  const appt = await db.cancelAppointment(id, phone);
  if (!appt) return { ok: false, message: `Nu am găsit programarea #${id} activă pentru acest număr.` };
  if (appt.google_event_id) await deleteCalendarEvent(appt.google_event_id);
  return { ok: true, message: `Programarea #${id} (${appt.service}, ${formatInClinicTz(new Date(appt.starts_at))}) a fost anulată.` };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
