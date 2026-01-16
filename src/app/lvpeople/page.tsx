import MemberQrCard from "./MemberQrCard";
import LVPeopleActions from "./LVPeopleActions";
import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

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
};

type MemberCardRow = {
  id: string;
  member_id: string;
  qr_secret: string;
  revoked: boolean;
  issued_at: string;
};

type MembershipRow = {
  id: string;
  member_id: string;
  status: "pending" | "active" | "expired";
  start_date: string;
  end_date: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars (server-side)."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function computeMemberStatus(args: {
  legacy: boolean;
  hasActiveMembership: boolean;
}) {
  if (args.legacy) return "LEGACY" as const;
  if (args.hasActiveMembership) return "ATTIVO" as const;
  return "SCADUTO" as const;
}

export default async function LVPeopleHomePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();

  if (!email) {
    redirect("/admin/login");
  }

  const supabase = getSupabaseAdmin();

  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select(
      "id, first_name, last_name, email, phone, legacy, language, created_at"
    )
    .ilike("email", email)
    .maybeSingle<MemberRow>();

  if (memberErr) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold">LV People</h1>
          <p className="mt-4 text-red-300">
            Errore lettura socio da Supabase: {memberErr.message}
          </p>
          <p className="mt-2 text-white/70 text-sm">
            Controlla che esistano le tabelle LV People in Supabase e che le env
            vars SUPABASE_URL / SUPABASE_SERVICE_ROLE siano impostate su Vercel e
            in locale.
          </p>
        </div>
      </main>
    );
  }

  if (!member) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">LV People</h1>
              <p className="mt-1 text-white/70 text-sm">
                Area socio (MVP) – tessera e storico accessi.
              </p>
            </div>
            <LVPeopleActions />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-white/80">
              Non risulto registrato come socio LV People per questa email:
            </p>
            <p className="mt-2 font-mono text-sm text-white">{email}</p>

            <p className="mt-4 text-white/70 text-sm">
              Se questa è un’email corretta, lo staff può importarti come socio
              (legacy) o associare il tuo account.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { data: card, error: cardErr } = await supabase
    .from("member_cards")
    .select("id, member_id, qr_secret, revoked, issued_at")
    .eq("member_id", member.id)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle<MemberCardRow>();

  const today = new Date().toISOString().slice(0, 10);
  const { data: activeMembership, error: msErr } = await supabase
    .from("memberships")
    .select("id, member_id, status, start_date, end_date")
    .eq("member_id", member.id)
    .eq("status", "active")
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle<MembershipRow>();

  const hasActiveMembership = !!activeMembership;
  const status = computeMemberStatus({
    legacy: member.legacy,
    hasActiveMembership,
  });

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">LV People</h1>
            <p className="mt-1 text-white/70 text-sm">
              Area socio (MVP) – tessera e storico accessi.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                status === "ATTIVO"
                  ? "border-white/30 bg-white/10"
                  : status === "LEGACY"
                  ? "border-white/20 bg-white/5"
                  : "border-red-400/30 bg-red-400/10 text-red-200"
              }`}
              title="Stato socio"
            >
              {status}
            </span>

            <LVPeopleActions />
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">La mia tessera</h2>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/60">Socio</div>
              <div className="mt-1 text-base font-semibold">
                {member.first_name} {member.last_name}
              </div>
              <div className="mt-2 text-sm text-white/70 break-words">
                <span className="text-white/50">Email:</span>{" "}
                {member.email || "—"}
              </div>
              <div className="mt-1 text-sm text-white/70 break-words">
                <span className="text-white/50">Telefono:</span>{" "}
                {member.phone || "—"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/60">Tessera</div>

              {cardErr ? (
                <p className="mt-2 text-sm text-red-300">
                  Errore lettura tessera: {cardErr.message}
                </p>
              ) : !card ? (
                <div className="mt-2 text-sm text-white/70">
                  Nessuna tessera associata a questo socio.
                  <div className="mt-2 text-xs text-white/50">
                    (MVP: la tessera viene creata in fase import / onboarding.)
                  </div>
                </div>
              ) : card.revoked ? (
                <div className="mt-2">
                  <div className="text-sm text-red-200 font-semibold">
                    Tessera revocata
                  </div>
                  <div className="mt-2 font-mono text-sm text-white/70 break-all">
                    {card.qr_secret}
                  </div>
                </div>
              ) : (
                <>
                  <MemberQrCard value={card.qr_secret} revoked={card.revoked} />

                  <div className="mt-2">
                    <div className="font-mono text-sm text-white break-all">
                      {card.qr_secret}
                    </div>
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                      QR pronto: mostra questo codice/QR all’ingresso.
                    </div>
                  </div>
                </>
              )}

              {msErr ? (
                <p className="mt-3 text-xs text-red-300">
                  Errore lettura membership: {msErr.message}
                </p>
              ) : (
                <p className="mt-3 text-xs text-white/50">
                  {member.legacy
                    ? "Sei socio legacy (fase transitoria)."
                    : hasActiveMembership
                    ? "Membership attiva."
                    : "Nessuna membership attiva."}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <a
              href="/lvpeople/accessi"
              className="inline-flex items-center justify-center rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold hover:opacity-90 transition"
            >
              Vedi storico accessi
            </a>

            <span className="text-xs text-white/50">
              Lo storico accessi è visibile solo a te e allo staff autorizzato.
            </span>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">Nota</h2>
          <p className="mt-2 text-sm text-white/70">
            Questo MVP usa l’email della sessione per trovare il socio in
            Supabase. In futuro potremo separare login admin vs login soci senza
            buttare via nulla.
          </p>
        </section>
      </div>
    </main>
  );
}
