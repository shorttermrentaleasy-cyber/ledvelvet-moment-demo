import MemberQrCard from "./MemberQrCard";
import MemberWallyforRefresh from "./MemberWallyforRefresh";
import MemberChoiceVerification from "./MemberChoiceVerification";
import LVPeopleActions from "./LVPeopleActions";
import React from "react";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { buildMemberTicketUrl } from "@/lib/member-ticket";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  legacy: boolean;
  language: string | null;
  created_at: string;
  membership_group: string | null;
  status: string | null;
  membership_expires_at: string | null;
  legacy_barcode: string | null;
};

type WallyforMembershipRow = {
  barcode: string;
  status: string | null;
};

type MemberTicketEvent = {
  id: string;
  name: string;
  starts_at: string | null;
  venue: string | null;
  city: string | null;
  member_ticket_url: string;
};

function formatEventDate(value: string | null) {
  if (!value) return "Data da definire";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data da definire";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function hasMemberAccess(email: string, barcode: string) {
  const value = cookies().get("lv_member_access")?.value || "";
  const separator = value.lastIndexOf(".");
  if (separator < 1 || value.slice(0, separator) !== barcode || !process.env.NEXTAUTH_SECRET) return false;
  const received = value.slice(separator + 1);
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(`${email}:${barcode}`)
    .digest("hex");
  return received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars (server-side).");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function LVPeopleHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ barcode?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();
  const params = await searchParams;
  const selectedBarcode = String(params?.barcode || "").trim();

  // ✅ CHANGE: entrypoint separato per LV People
  if (!email) {
    redirect("/login");
  }

  const supabase = getSupabaseAdmin();

  const { data: memberRows, error: memberErr } = await supabase
    .from("wallyfor_members")
    .select("barcode, first_name, last_name, email, phone, membership_group, status, membership_expires_at, last_seen_at")
    .ilike("email", email)
    .eq("source", "wallyfor_api")
    .eq("is_present", true)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  const members = (memberRows || []).map((row) => ({
    id: row.barcode,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    email: row.email,
    phone: row.phone,
    legacy: false,
    language: null,
    created_at: row.last_seen_at || "",
    membership_group: row.membership_group,
    status: row.status,
    membership_expires_at: row.membership_expires_at,
    legacy_barcode: row.barcode,
  })) as MemberRow[];
  const selectedIsAllowed = members.length === 1 ||
    (selectedBarcode ? hasMemberAccess(email, selectedBarcode) : false);
  const member = selectedBarcode && selectedIsAllowed
    ? members.find((candidate) => candidate.legacy_barcode === selectedBarcode) || null
    : members.length === 1
      ? members[0]
      : null;

  if (memberErr) {
    return (
      <main className="min-h-screen bg-[#080008] text-white p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold">LV People</h1>
          <p className="mt-4 text-red-300">Errore lettura socio da Supabase: {memberErr.message}</p>
          <p className="mt-2 text-white/70 text-sm">
            Controlla che esistano le tabelle LV People in Supabase e che le env vars SUPABASE_URL /
            SUPABASE_SERVICE_ROLE siano impostate su Vercel e in locale.
          </p>
        </div>
      </main>
    );
  }

  if (members.length > 1 && !member) {
    return (
      <main className="min-h-screen bg-[#080008] p-6 text-white">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">LV People</h1>
              <p className="mt-1 text-sm text-white/70">Questa email è associata a più soci.</p>
            </div>
            <LVPeopleActions />
          </div>

          <section className="mt-6 rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-6">
            <h2 className="text-lg font-semibold">Scegli la tua tessera</h2>
            <p className="mt-2 text-sm text-white/65">
              Seleziona il nominativo corretto. Ogni scheda verrà aperta usando esclusivamente il suo barcode.
            </p>
            <div className="mt-5 space-y-3">
              {members.map((candidate) => (
                <MemberChoiceVerification
                  key={candidate.id}
                  barcode={candidate.legacy_barcode || ""}
                  name={`${candidate.first_name} ${candidate.last_name}`.trim()}
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!member) {
    return (
      <main className="min-h-screen bg-[#080008] text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">LV People</h1>
              <p className="mt-1 text-white/70 text-sm">La tua tessera e i tuoi accessi LEDVELVET.</p>
            </div>
            <LVPeopleActions />
          </div>

          <div className="mt-6 rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-5">
            <p className="text-white/80">Non risulto registrato come socio LV People per questa email:</p>
            <p className="mt-2 font-mono text-sm text-white">{email}</p>

            <p className="mt-4 text-white/70 text-sm">
              Per diventare socio, invia la richiesta attraverso il percorso ufficiale Wallyfor.
            </p>

            <a
              href="/become-member?from=/lvpeople"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#8d003f] to-[#e00072] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition hover:brightness-110"
            >
              Diventa socio
            </a>
          </div>
        </div>
      </main>
    );
  }

  const memberBarcode = member.legacy_barcode?.trim() || null;
  let wallyforMembership: WallyforMembershipRow | null = null;

  if (memberBarcode) {
    const { data } = await supabase
      .from("wallyfor_members")
      .select("barcode, status")
      .eq("barcode", memberBarcode)
      .eq("source", "wallyfor_api")
      .eq("is_present", true)
      .maybeSingle<WallyforMembershipRow>();

    wallyforMembership = data;
  }

  if (!wallyforMembership) {
    return (
      <main className="min-h-screen bg-[#080008] p-6 text-white">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">LV People</h1>
              <p className="mt-1 text-sm text-white/70">La tua tessera e i tuoi accessi LEDVELVET.</p>
            </div>
            <LVPeopleActions />
          </div>

          <div className="mt-6 rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-5">
            <h2 className="text-lg font-semibold">Nessuna tessera Wallyfor associata</h2>
            <p className="mt-3 text-sm text-white/70">
              Per questa email non risulta una tessera presente nell’anagrafica ufficiale Wallyfor.
              Un eventuale vecchio record interno non può essere usato per mostrare il QR o avviare il pagamento.
            </p>
            <a
              href="/become-member?from=/lvpeople"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#8d003f] to-[#e00072] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition hover:brightness-110"
            >
              Diventa socio
            </a>
          </div>
        </div>
      </main>
    );
  }

  const wallyforStatus = wallyforMembership.status?.trim() || "Stato non disponibile";
  const normalizedStatus = wallyforStatus.toUpperCase();
  const isWallyforMembershipActive = normalizedStatus === "ATTIVA";
  const isWallyforMembershipInactive = normalizedStatus === "NON ATTIVA";
  const qrValue = wallyforMembership.barcode.trim() || null;
  const today = new Date().toISOString().slice(0, 10);
  const isMembershipExpired = Boolean(
    member.membership_expires_at && member.membership_expires_at < today
  );
  const canBuyMemberTicket = isWallyforMembershipActive && !isMembershipExpired && Boolean(qrValue);
  const hasCompleteTicketProfile = Boolean(member.email?.trim() && member.phone?.trim());

  const { data: memberTicketEvents } = await supabase
    .from("events")
    .select("id, name, starts_at, venue, city, member_ticket_url")
    .eq("member_ticket_enabled", true)
    .not("member_ticket_url", "is", null)
    .gte("starts_at", `${today}T00:00:00.000Z`)
    .order("starts_at", { ascending: true })
    .limit(5)
    .returns<MemberTicketEvent[]>();

  const eventIds = (memberTicketEvents || []).map((event) => event.id);
  const purchasedEventIds = new Set<string>();

  if (qrValue && eventIds.length > 0) {
    const { data: existingTickets } = await supabase
      .from("xceed_tickets")
      .select("event_id")
      .in("event_id", eventIds)
      .eq("member_barcode", qrValue)
      .neq("status", "cancelled");

    for (const ticket of existingTickets || []) {
      if (ticket.event_id) purchasedEventIds.add(String(ticket.event_id));
    }
  }
  const activationUrl = qrValue
    ? `https://wallyfor.com/rinnovi/step3.php?idcode=5355&msg=${encodeURIComponent(qrValue)}&imp=`
    : "https://wallyfor.com/rinnovi/index.php?idcode=5355";

  return (
    <main className="min-h-screen bg-[#080008] text-white p-6">
      {qrValue ? <MemberWallyforRefresh barcode={qrValue} /> : null}
      <div className="max-w-3xl mx-auto relative">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(170,0,66,0.30),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,0,126,0.16),transparent_42%)]" />
        <div className="relative z-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">LV People</h1>
            <p className="mt-1 text-white/70 text-sm">La tua tessera e i tuoi accessi LEDVELVET.</p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                isWallyforMembershipActive
                  ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                  : "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100"
              }`}
              title="Stato tessera Wallyfor"
            >
              {wallyforStatus}
            </span>

            <LVPeopleActions />
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-6">
          <h2 className="text-lg font-semibold">La mia tessera</h2>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="text-sm text-white/60">Socio</div>

    <div className="mt-1 text-base font-semibold">
      {member.first_name} {member.last_name}
    </div>

    <div className="mt-2 text-sm text-white/70 break-words">
      <span className="text-white/50">Email:</span> {member.email || "—"}
    </div>

    <div className="mt-1 text-sm text-white/70 break-words">
      <span className="text-white/50">Telefono:</span> {member.phone || "—"}
    </div>

    <div className="mt-1 text-sm text-white/70 break-words">
      <span className="text-white/50">Gruppo:</span> {member.membership_group || "—"}
    </div>

    <div className="mt-1 text-sm text-white/70 break-words">
      <span className="text-white/50">Stato:</span> {member.status || "—"}
    </div>

    <div className="mt-1 text-sm text-white/70 break-words">
      <span className="text-white/50">Scadenza:</span> {member.membership_expires_at || "—"}
    </div>

    <div className="mt-1 text-sm text-white/70 break-words">
      <span className="text-white/50">Barcode:</span> {member.legacy_barcode || "—"}
    </div>
  </div>

            <div className="rounded-xl border border-fuchsia-300/15 bg-black/30 p-4">
              <div className="text-sm text-white/60">QR tessera</div>
              {qrValue ? (
                <>
                  <div className="mt-3">
                    <MemberQrCard value={qrValue} revoked={false} />
                  </div>
                  <div className="mt-3 font-mono text-sm text-white break-all">{qrValue}</div>
                  <p className="mt-2 text-xs text-white/55">Mostra questo QR all’ingresso.</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-white/65">QR non disponibile: il barcode non è presente in Wallyfor.</p>
              )}
            </div>
          </div>

          {isWallyforMembershipInactive ? (
            <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5">
              <p className="text-sm font-semibold text-amber-100">La tessera è emessa ma non ancora attiva.</p>
              <p className="mt-1 text-sm text-white/70">
                La quota associativa da pagare è di 3 €. Completa il pagamento su Wallyfor per
                attivare la tessera e aggiornare la scadenza.
              </p>
              <a
                href={activationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Paga 3 € e attiva la tessera
              </a>
            </div>
          ) : null}

          {(memberTicketEvents || []).length > 0 ? (
            <div className="mt-6 rounded-2xl border border-fuchsia-300/20 bg-black/25 p-5">
              <h3 className="text-base font-semibold">Biglietti riservati ai soci</h3>
              <div className="mt-4 space-y-3">
                {(memberTicketEvents || []).map((event) => {
                  const alreadyPurchased = purchasedEventIds.has(event.id);
                  const checkoutUrl = qrValue
                    ? buildMemberTicketUrl(event.member_ticket_url, {
                        firstName: member.first_name,
                        lastName: member.last_name,
                        email: member.email || "",
                        phone: member.phone || "",
                        barcode: qrValue,
                      })
                    : null;
                  const location = [event.venue, event.city].filter(Boolean).join(" · ");

                  return (
                    <div key={event.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="font-semibold text-white">{event.name}</div>
                      <div className="mt-1 text-sm text-white/60">
                        {formatEventDate(event.starts_at)}{location ? ` · ${location}` : ""}
                      </div>

                      {alreadyPurchased ? (
                        <div className="mt-3 inline-flex rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                          Biglietto già acquistato
                        </div>
                      ) : canBuyMemberTicket && hasCompleteTicketProfile && checkoutUrl ? (
                        <a
                          href={checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#8d003f] to-[#e00072] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/40 transition hover:brightness-110"
                        >
                          Acquista il tuo biglietto
                        </a>
                      ) : (
                        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                          {!canBuyMemberTicket
                            ? "Per acquistare devi avere la tessera attiva e non scaduta."
                            : "Per acquistare servono email e telefono associati alla tessera."}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/lvpeople/accessi"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#8d003f] to-[#e00072] text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-fuchsia-950/40 hover:brightness-110 transition"
            >
              Vedi storico accessi
            </a>

            <span className="text-xs text-white/50">Lo storico accessi è visibile solo a te e allo staff autorizzato.</span>
          </div>
        </section>

        </div>
      </div>
    </main>
  );
}
