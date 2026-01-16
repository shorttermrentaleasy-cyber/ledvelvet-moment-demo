import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

type AccessRow = {
  id: string;
  checkin_at: string;
  result: "allowed" | "denied";
  reason: string | null;
  method: string | null;
  events: {
    name: string;
    city: string | null;
    venue: string | null;
  }[]; // ✅ ARRAY (corretto)
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function LVPeopleAccessiPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email) redirect("/admin/login");

  const supabase = getSupabaseAdmin();

  // 1) trova socio
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!member) redirect("/lvpeople");

  // 2) carica ultimi accessi
  const { data } = await supabase
    .from("checkins")
    .select(
      `
      id,
      checkin_at,
      result,
      reason,
      method,
      events (
        name,
        city,
        venue
      )
    `
    )
    .eq("member_id", member.id)
    .order("checkin_at", { ascending: false })
    .limit(20);

  // ✅ Cast corretto
  const accessi = (data ?? []) as AccessRow[];

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Storico accessi</h1>
          <a
            href="/lvpeople"
            className="text-sm text-white/70 hover:text-white"
          >
            ← Torna alla tessera
          </a>
        </header>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          {accessi.length === 0 ? (
            <p className="text-white/70 text-sm">
              Nessun accesso registrato.
            </p>
          ) : (
            <ul className="divide-y divide-white/10">
              {accessi.map((a) => {
                const event = a.events?.[0]; // ✅ primo evento

                return (
                  <li key={a.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">
                          {event?.name ?? "Evento"}
                        </div>
                        <div className="text-xs text-white/60">
                          {new Date(a.checkin_at).toLocaleString("it-IT")}
                          {event?.city ? ` · ${event.city}` : ""}
                        </div>
                        {a.reason && (
                          <div className="mt-1 text-xs text-white/50">
                            Motivo: {a.reason}
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <span
                          className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                            a.result === "allowed"
                              ? "bg-white text-black"
                              : "bg-red-500 text-white"
                          }`}
                        >
                          {a.result === "allowed"
                            ? "CONSENTITO"
                            : "NEGATO"}
                        </span>
                        {a.method && (
                          <div className="mt-1 text-xs text-white/50">
                            {a.method}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
