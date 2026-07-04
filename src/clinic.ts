/**
 * Configurația cabinetului stomatologic.
 * Modifică datele de mai jos pentru cabinetul tău (sau suprascrie prin variabile de mediu).
 */

export interface ClinicService {
  name: string;
  price: string;
  durationMinutes: number;
}

export interface ClinicConfig {
  name: string;
  address: string;
  phone: string;
  doctors: string[];
  schedule: Record<string, { open: string; close: string } | null>;
  services: ClinicService[];
  slotMinutes: number;
  timezone: string;
}

export const clinic: ClinicConfig = {
  name: process.env.CLINIC_NAME || "Cabinet Stomatologic DemoDent",
  address: process.env.CLINIC_ADDRESS || "Str. Exemplu nr. 10, Râmnicu Vâlcea",
  phone: process.env.CLINIC_PHONE || "+40 700 000 000",
  doctors: (process.env.CLINIC_DOCTORS || "Dr. Maria Popescu").split(",").map(d => d.trim()),
  // null = închis. Ore în format HH:mm, ora locală.
  schedule: {
    monday: { open: "09:00", close: "18:00" },
    tuesday: { open: "09:00", close: "18:00" },
    wednesday: { open: "09:00", close: "18:00" },
    thursday: { open: "09:00", close: "18:00" },
    friday: { open: "09:00", close: "16:00" },
    saturday: null,
    sunday: null,
  },
  services: [
    { name: "Consultație + plan de tratament", price: "150 lei", durationMinutes: 30 },
    { name: "Detartraj + periaj profesional", price: "250 lei", durationMinutes: 60 },
    { name: "Obturație (plombă) fizionomică", price: "300 lei", durationMinutes: 60 },
    { name: "Extracție dentară simplă", price: "250 lei", durationMinutes: 30 },
    { name: "Albire profesională", price: "800 lei", durationMinutes: 90 },
    { name: "Urgență stomatologică", price: "200 lei", durationMinutes: 30 },
  ],
  slotMinutes: 30,
  timezone: process.env.CLINIC_TIMEZONE || "Europe/Bucharest",
};

const dayNamesRo: Record<string, string> = {
  monday: "Luni",
  tuesday: "Marți",
  wednesday: "Miercuri",
  thursday: "Joi",
  friday: "Vineri",
  saturday: "Sâmbătă",
  sunday: "Duminică",
};

export function scheduleAsText(): string {
  return Object.entries(clinic.schedule)
    .map(([day, h]) => `${dayNamesRo[day]}: ${h ? `${h.open} - ${h.close}` : "închis"}`)
    .join("\n");
}

export function servicesAsText(): string {
  return clinic.services
    .map(s => `- ${s.name}: ${s.price} (~${s.durationMinutes} min)`)
    .join("\n");
}
