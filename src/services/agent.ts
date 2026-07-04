import Anthropic from "@anthropic-ai/sdk";
import { clinic, scheduleAsText, servicesAsText } from "../clinic";
import * as db from "../db";
import { getAvailableSlots, bookAppointment, cancelAppointment, listMyAppointments } from "./booking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

function systemPrompt(): string {
  const today = new Intl.DateTimeFormat("ro-RO", {
    timeZone: clinic.timezone,
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone }).format(new Date());

  return `Ești asistentul virtual al cabinetului "${clinic.name}" și comunici cu pacienții pe WhatsApp.

DATA DE AZI: ${today} (${todayISO}). Folosește-o pentru a calcula corect date relative ("mâine", "joi" etc.).

INFORMAȚII CABINET:
Adresă: ${clinic.address}
Telefon: ${clinic.phone}
Medici: ${clinic.doctors.join(", ")}

PROGRAM:
${scheduleAsText()}

SERVICII ȘI PREȚURI:
${servicesAsText()}

REGULI:
1. Răspunde DOAR în română, prietenos și concis — mesaje scurte, potrivite pentru WhatsApp. Fără formatare markdown (fără **, ##, liste cu -). Poți folosi emoji cu moderație.
2. Rolul tău: răspunzi la întrebări despre servicii, prețuri, program, adresă și faci programări.
3. Pentru programare ai nevoie de: numele pacientului, serviciul dorit, data și ora. Cere-le pe rând dacă lipsesc, nu toate deodată.
4. Verifică ÎNTOTDEAUNA disponibilitatea cu tool-ul get_available_slots înainte de a confirma o oră. Nu inventa sloturi.
5. Confirmă detaliile cu pacientul înainte de a apela book_appointment.
6. NU oferi diagnostice sau sfaturi medicale specifice. Pentru probleme medicale recomandă o consultație. Pentru dureri severe/urgențe, recomandă să sune direct la ${clinic.phone}.
7. Dacă nu știi ceva sau situația e complexă, spune că un coleg uman va reveni cu un răspuns și recomandă apel telefonic.
8. Nu discuta alte subiecte în afara cabinetului și serviciilor stomatologice.`;
}

const tools: Anthropic.Tool[] = [
  {
    name: "get_available_slots",
    description: "Returnează orele libere pentru o zi dată, ținând cont de programul cabinetului și programările existente.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Data în format YYYY-MM-DD" },
        service: { type: "string", description: "Serviciul dorit (pentru durata corectă). Opțional." },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description: "Creează o programare confirmată. Apelează DOAR după ce pacientul a confirmat numele, serviciul, data și ora.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_name: { type: "string", description: "Numele complet al pacientului" },
        service: { type: "string", description: "Serviciul dorit" },
        date: { type: "string", description: "Data în format YYYY-MM-DD" },
        time: { type: "string", description: "Ora în format HH:mm" },
      },
      required: ["patient_name", "service", "date", "time"],
    },
  },
  {
    name: "list_my_appointments",
    description: "Listează programările viitoare ale pacientului curent (identificat prin numărul de WhatsApp).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "cancel_appointment",
    description: "Anulează o programare după ID. Folosește list_my_appointments mai întâi dacă pacientul nu știe ID-ul, apoi cere confirmare.",
    input_schema: {
      type: "object" as const,
      properties: {
        appointment_id: { type: "number", description: "ID-ul programării de anulat" },
      },
      required: ["appointment_id"],
    },
  },
];

async function runTool(name: string, input: any, phone: string): Promise<string> {
  try {
    switch (name) {
      case "get_available_slots": {
        const svc = clinic.services.find(s =>
          input.service && s.name.toLowerCase().includes(String(input.service).toLowerCase().slice(0, 10))
        );
        const slots = await getAvailableSlots(input.date, svc?.durationMinutes ?? clinic.slotMinutes);
        return slots.length
          ? `Sloturi libere pe ${input.date}: ${slots.join(", ")}`
          : `Nu există sloturi libere pe ${input.date} (zi închisă sau complet ocupată).`;
      }
      case "book_appointment": {
        const res = await bookAppointment({
          phone,
          patientName: input.patient_name,
          service: input.service,
          dateStr: input.date,
          timeStr: input.time,
        });
        return res.message;
      }
      case "list_my_appointments":
        return await listMyAppointments(phone);
      case "cancel_appointment": {
        const res = await cancelAppointment(Number(input.appointment_id), phone);
        return res.message;
      }
      default:
        return `Tool necunoscut: ${name}`;
    }
  } catch (err: any) {
    console.error(`[agent] Tool ${name} error:`, err);
    return `Eroare internă la ${name}: ${err.message}`;
  }
}

/**
 * Procesează un mesaj de la pacient și returnează răspunsul agentului.
 * Rulează un loop de tool-use până când Claude produce un răspuns text final.
 */
export async function handlePatientMessage(phone: string, text: string): Promise<string> {
  await db.saveMessage(phone, "user", text);
  const history = await db.getHistory(phone, 20);

  const messages: Anthropic.MessageParam[] = history.map(m => ({ role: m.role, content: m.content }));

  let finalText = "";
  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(),
      tools,
      messages,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

    if (toolUses.length === 0) {
      finalText = textBlocks.map(b => b.text).join("\n").trim();
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await runTool(tu.name, tu.input, phone);
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText = `Îmi pare rău, am întâmpinat o problemă tehnică. Vă rugăm să ne sunați la ${clinic.phone}.`;
  }

  await db.saveMessage(phone, "assistant", finalText);
  return finalText;
}
