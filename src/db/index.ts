import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_phone_created ON messages (phone, created_at DESC);

    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      service TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      duration_minutes INT NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      google_event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_appointments_starts ON appointments (starts_at) WHERE status = 'confirmed';

    CREATE TABLE IF NOT EXISTS processed_messages (
      wa_message_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("[db] Migration complete");
}

// ---------- Idempotency ----------

export async function alreadyProcessed(waMessageId: string): Promise<boolean> {
  const res = await pool.query(
    `INSERT INTO processed_messages (wa_message_id) VALUES ($1)
     ON CONFLICT (wa_message_id) DO NOTHING RETURNING wa_message_id`,
    [waMessageId]
  );
  return res.rowCount === 0;
}

// ---------- Conversation history ----------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function saveMessage(phone: string, role: "user" | "assistant", content: string): Promise<void> {
  await pool.query(`INSERT INTO messages (phone, role, content) VALUES ($1, $2, $3)`, [phone, role, content]);
}

export async function getHistory(phone: string, limit = 20): Promise<ChatMessage[]> {
  const res = await pool.query(
    `SELECT role, content FROM messages WHERE phone = $1 ORDER BY created_at DESC LIMIT $2`,
    [phone, limit]
  );
  return res.rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

// ---------- Appointments ----------

export interface Appointment {
  id: number;
  phone: string;
  patient_name: string;
  service: string;
  starts_at: Date;
  duration_minutes: number;
  status: string;
  google_event_id: string | null;
}

export async function getAppointmentsForDay(dayStart: Date, dayEnd: Date): Promise<Appointment[]> {
  const res = await pool.query(
    `SELECT * FROM appointments WHERE status = 'confirmed' AND starts_at >= $1 AND starts_at < $2 ORDER BY starts_at`,
    [dayStart, dayEnd]
  );
  return res.rows;
}

export async function createAppointment(a: {
  phone: string;
  patient_name: string;
  service: string;
  starts_at: Date;
  duration_minutes: number;
  google_event_id?: string | null;
}): Promise<Appointment> {
  const res = await pool.query(
    `INSERT INTO appointments (phone, patient_name, service, starts_at, duration_minutes, google_event_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [a.phone, a.patient_name, a.service, a.starts_at, a.duration_minutes, a.google_event_id ?? null]
  );
  return res.rows[0];
}

export async function getUpcomingAppointments(phone: string): Promise<Appointment[]> {
  const res = await pool.query(
    `SELECT * FROM appointments WHERE phone = $1 AND status = 'confirmed' AND starts_at > now() ORDER BY starts_at`,
    [phone]
  );
  return res.rows;
}

export async function cancelAppointment(id: number, phone: string): Promise<Appointment | null> {
  const res = await pool.query(
    `UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND phone = $2 AND status = 'confirmed' RETURNING *`,
    [id, phone]
  );
  return res.rows[0] ?? null;
}
