# 🦷 DentroBot

Agent AI pe WhatsApp pentru cabinete stomatologice. Răspunde pacienților la întrebări despre servicii, prețuri și program, și face programări automat — sincronizate cu Google Calendar.

## Arhitectură

- **Node.js + Express + TypeScript** — server webhook
- **Meta WhatsApp Cloud API** — primire/trimitere mesaje
- **Claude API (Anthropic)** — agentul conversațional cu tool-use (verificare sloturi, programare, anulare)
- **PostgreSQL** — istoric conversații, programări, idempotență mesaje
- **Google Calendar** (opțional) — sincronizare programări în calendarul cabinetului

```
Pacient (WhatsApp) → Meta Cloud API → POST /webhook → Claude (tools) → PostgreSQL + Google Calendar → răspuns WhatsApp
```

## Deploy pe Railway

1. **Creează proiectul**: Railway → New Project → *Deploy from GitHub repo* → selectează `balomadalin/dentrobot`
2. **Adaugă PostgreSQL**: în proiect → *+ New* → *Database* → *PostgreSQL*. Apoi la serviciul dentrobot → *Variables* → adaugă `DATABASE_URL` cu referință `${{Postgres.DATABASE_URL}}`
3. **Setează variabilele de mediu** (vezi `.env.example`): minim `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
4. **Generează domeniul public**: Settings → Networking → *Generate Domain*. Vei obține ceva de forma `https://dentrobot-production.up.railway.app`

## Configurare Meta WhatsApp Cloud API

1. Mergi pe [developers.facebook.com](https://developers.facebook.com) → *My Apps* → *Create App* → tip **Business**
2. Adaugă produsul **WhatsApp** în aplicație
3. Din **WhatsApp → API Setup** copiază:
   - `Phone Number ID` → variabila `WHATSAPP_PHONE_NUMBER_ID`
   - `Temporary access token` → variabila `WHATSAPP_TOKEN` (pentru producție generează un token permanent din Business Settings → System Users)
4. **Configurează webhook-ul**: WhatsApp → Configuration → *Edit*:
   - Callback URL: `https://<domeniul-tau-railway>/webhook`
   - Verify token: exact valoarea din variabila `WHATSAPP_VERIFY_TOKEN`
   - Apasă *Verify and save*, apoi la *Webhook fields* abonează-te la **messages**
5. Testează: trimite un mesaj de pe telefonul tău către numărul de test din API Setup

## Configurare Google Calendar (opțional)

1. [console.cloud.google.com](https://console.cloud.google.com) → creează proiect → activează **Google Calendar API**
2. *IAM & Admin → Service Accounts* → creează un service account → *Keys* → *Add key* → JSON
3. Deschide Google Calendar al cabinetului → Settings → *Share with specific people* → adaugă email-ul service account-ului cu drept **Make changes to events**
4. Setează în Railway:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = conținutul fișierului JSON, pe o singură linie
   - `GOOGLE_CALENDAR_ID` = ID-ul calendarului (Settings → *Integrate calendar*)

## Personalizare cabinet

Datele cabinetului (nume, program, servicii, prețuri, medici) se află în `src/clinic.ts`. Nume, adresă, telefon, medici și timezone pot fi suprascrise prin variabile de mediu (`CLINIC_*`), fără modificare de cod.

## Development local

```bash
cp .env.example .env   # completează valorile
npm install
npm run dev
```

Pentru webhook local folosește un tunel (ex. `ngrok http 3000`) și pune URL-ul ngrok în configurarea Meta.

## Ce știe agentul să facă

- Răspunde la întrebări: servicii, prețuri, program, adresă, medici
- Verifică sloturile libere în timp real (program cabinet + programări existente)
- Face programări cu confirmare (nume, serviciu, dată, oră)
- Listează și anulează programările pacientului
- Escaladează către telefon pentru urgențe sau situații complexe
- Nu oferă diagnostice sau sfaturi medicale

---
Dezvoltat de [Wirbox](https://wirbox.ro)
