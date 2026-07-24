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
  membership_group: string | null;
  status: string | null;
  membership_expires_at: string | null;
  legacy_barcode: string | null;
};

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

export default async function LVPeopleHomePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();

  // ✅ CHANGE: entrypoint separato per LV People
  if (!email) {
    redirect("/login");
  }

  const supabase = getSupabaseAdmin();

  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, phone, legacy, language, created_at, membership_group, status, membership_expires_at, legacy_barcode")
    .ilike("email", email)
    .maybeSingle<MemberRow>();

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
              Se questa è un’email corretta, lo staff può importarti come socio (legacy) o associare il tuo account.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const wallyforStatus = member.status?.trim() || "Stato non disponibile";
  const normalizedStatus = wallyforStatus.toUpperCase();
  const isWallyforMembershipActive = normalizedStatus === "ATTIVA";
  const isWallyforMembershipInactive = normalizedStatus === "NON ATTIVA";
  const qrValue = member.legacy_barcode?.trim() || null;

  return (
    <main className="min-h-screen bg-[#080008] text-white p-6">
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
                  <div className="mt-3 rounded-2xl bg-white p-4">
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
                Completa il pagamento su Wallyfor per attivarla e aggiornare la scadenza.
              </p>
              <a
                href="https://wallyfor.com/rinnovi/index.php?idcode=5355"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Paga e attiva la tessera – 3 €
              </a>
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
