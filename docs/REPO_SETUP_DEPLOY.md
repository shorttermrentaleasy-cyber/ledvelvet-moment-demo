# LedVelvet – Repo Setup & Deploy Guide (IT)

Questa guida ti consegna tutto il necessario per pubblicare il sito/app LedVelvet con **posta Aruba**, **hosting Vercel**, **DB/Auth Supabase**, **pagamenti Stripe** e **ticket esterni (Xceed/Shotgun)**.

---

## 1) Repository – Struttura

```
ledvelvet/
  .env.local.example
  README.md
  DNS.md
  supabase/
    schema.sql
    policies.sql
  src/
    app/
      page.tsx
      membership/page.tsx
      shop/page.tsx
      area-socio/page.tsx
      admin/page.tsx
      api/
        webhooks/
          stripe/route.ts
          xceed/route.ts
          shotgun/route.ts
        kyc/upload/route.ts
        card/[id]/qrcode/route.ts
    components/
      forms/
      ui/
    lib/
      supabase.ts
      stripe.ts
      mailer.ts
      auth.ts
      utils.ts
  public/
    logo.svg
    og.jpg
```

---

## 2) Variabili d’Ambiente (Vercel → Project → Settings → Environment Variables)

Copia da `.env.local.example`:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_SITE_URL=https://ledvelvet.it
NEXT_PUBLIC_APP_SUBDOMAIN=https://app.ledvelvet.it
NEXT_PUBLIC_SHOP_SUBDOMAIN=https://shop.ledvelvet.it

# Mail (Aruba)
SMTP_HOST=smtp.aruba.it
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@ledvelvet.it
SMTP_PASS=***
SMTP_FROM="LedVelvet APS <noreply@ledvelvet.it>"

# Security
JWT_SECRET=change_me_long_random
ENCRYPTION_KEY=32_bytes_hex_or_base64
```

---

## 3) Mail transazionale (Aruba) – Nodemailer

**Host:** `smtp.aruba.it` • **Porta:** `465` (SSL) o `587` (STARTTLS) • **Auth:** utente = casella, password = password casella.

```ts
// src/lib/mailer.ts
import nodemailer from "nodemailer";

export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE) === "true",
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
});

export async function sendMail(to: string, subject: string, html: string) {
  await mailer.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
}
```

**Mittenti consigliati:** `noreply@ledvelvet.it` (transazionali), `membership@ledvelvet.it` (KYC/membership). Aggiungi SPF/DMARC su Aruba e abilita **DKIM** dal pannello mail.

Template base (HTML):

```ts
export const tplMembershipApproved = (name: string, cardUrl: string) => `
  <div style="font-family:Inter,system-ui">
    <h2>Benvenuto/a in LedVelvet</h2>
    <p>Ciao ${name}, la tua membership è <b>attiva</b>.</p>
    <p>Scarica la tua tessera: <a href="${cardUrl}">Aggiungi a Wallet</a></p>
    <p>Ci vediamo al prossimo evento ✨</p>
  </div>`;
```

---

## 4) Supabase – Schema + Policies (estratto)

Carica `supabase/schema.sql` (modelli dati) e `supabase/policies.sql` (RLS). RLS attiva per **profiles, memberships, member_cards, orders**. Esempio policy lettura profilo proprio:

```sql
create policy "read_own_profile" on public.profiles
for select using (auth.uid() = user_id);
```

---

## 5) Stripe – Prodotti e Webhook

- Crea su Stripe: **Prices** per Membership (BASE/VIP/FOUNDER – annuale) e prodotti **Merch**.
- Attiva **Checkout** e imposta **success_url/cancel_url** verso `app.ledvelvet.it`.
- Webhook: aggiungi endpoint `https://ledvelvet.it/api/webhooks/stripe` con eventi `checkout.session.completed`, `customer.subscription.updated`, `payment_intent.succeeded`.
- Copia `STRIPE_WEBHOOK_SECRET` in Vercel.

Route (stub):

```ts
// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
  const sig = req.headers.get("stripe-signature")!;
  const raw = await req.text();
  try {
    const evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    // TODO: handle checkout.session.completed → create order / activate membership
    return NextResponse.json({ ok: true });
  } catch (err) {
    return new NextResponse("Webhook Error", { status: 400 });
  }
}
export const config = { api: { bodyParser: false } } as any;
```

---

## 6) Xceed/Shotgun – Import & Webhook

- **Fase 1:** Import CSV → endpoint `POST /api/webhooks/xceed` che normalizza in `events` e `attendances` (source = "xceed").
- **Fase 2:** Webhook ufficiale (se disponibile) per acquisti/partecipazioni con email/phone match → associazione al profilo o contatto da reclamare.

Stub:

```ts
// src/app/api/webhooks/xceed/route.ts
import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  const payload = await req.json();
  // TODO: upsert events & attendances
  return NextResponse.json({ ok: true });
}
```

---

## 7) Tessera Digitale & QR

- Genera `qr_secret` random per ogni tessera; crea endpoint `GET /api/card/:id/qrcode` che produce PNG.
- Per Apple/Google Wallet: usa lib server `passkit-generator` (fase 2) con certificati.

Stub QR:

```ts
// src/app/api/card/[id]/qrcode/route.ts
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const png = await QRCode.toBuffer(`LV:${params.id}`);
  return new NextResponse(png, { headers: { "Content-Type": "image/png" } });
}
```

---

## 8) DNS (Aruba) – Record

- **A (@)** → `76.76.21.21` (Vercel apex)
- **CNAME (www)** → `cname.vercel-dns.com`
- **CNAME (app)** → `app-ledvelvet.vercel.app`
- **CNAME (shop)** → `shop-ledvelvet.vercel.app`
- **SPF (TXT @)** → `v=spf1 include:_spf.aruba.it ~all`
- **DMARC (TXT _dmarc)** → `v=DMARC1; p=quarantine; rua=mailto:dmarc@ledvelvet.it`
- **DKIM**: attivalo da pannello Aruba Mail (ti fornisce CNAME/TXT da aggiungere).

---

## 9) Deploy – Passi Rapidi

1. **Fork** del repo → collega a **Vercel**.
2. Imposta **env** (sezione 2) su Vercel (Production + Preview).
3. Verifica dominio `ledvelvet.it` su Vercel → aggiungi record DNS su Aruba.
4. Crea database su **Supabase** → incolla `schema.sql` e `policies.sql` → copia chiavi.
5. Crea prodotti/prezzi su **Stripe** → copia chiavi/publishable + webhook secret.
6. Deploy → test UAT (pagamento reale €1 per membership test).

---

## 10) Test UAT – Checklist

- Sign‑up, KYC upload, pagamento membership → email di conferma via Aruba SMTP.
- Generazione tessera + QR → verifica da mobile con rete scarsa.
- Shop: carrello → Stripe Checkout → mail ordine.
- Import CSV Xceed/Shotgun → attendances visibili in Area Socio.
- SEO: meta/OG, sitemap, robots; Pixel GA4/Meta/TikTok tracciano UTM.

---

## 11) README (estratto)

```md
# LedVelvet App

## Dev
pnpm i
pnpm dev

## Env
cp .env.local.example .env.local

## Lint/Build
pnpm lint
pnpm build
```

---

## 12) Note Brand

- `public/logo.svg` verrà sostituito con il logo estratto dai social.
- `og.jpg` generato con gradienti **Ethereal Magenta** / **Electric Blue**.

---

## 13) Roadmap Fase 2

- Wallet pass ufficiali (Apple/Google) con certificati.
- Integrazione Fatture in Cloud (SDI) per merch.
- PayPal/Satispay.
- Door‑check PWA offline‑first (Capacitor).

---

**Pronto a generare il repo base con questi file e stubs attivi.**
