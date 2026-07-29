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
  legacy_barcode: string | null;
  created_at: string;
  membership_group: string | null;
  status: string | null;
  membership_expires_at: string | null;
};

type WallyRow = {
  id: string;
  barcode: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  raw: any;
  updated_at: string;
};

// NB: events può arrivare come ARRAY oppure OGGETTO (PostgREST embed)
type EventEmbed =
  | {
      name: string | null;
      city: string | null;
      venue: string | null;
      start_at: string | null;
    }
  | {
      name: string | null;
      city: string | null;
      venue: string | null;
      start_at: string | null;
    }[]
  | null
  | undefined;

type AccessRow = {
  id: string;
  event_id: string;
  checkin_at: string | null; // timestamptz
  created_at: string | null; // timestamptz (fallback)
  result: "allowed" | "denied";
  reason: string | null;
  method: string | null;
  kind: string | null;
  scanned_code: string | null;
  events: EventEmbed;
};

type XceedTicketRow = {
  event_id: string;
  transaction_id: string | null;
  qr_code: string | null;
  email: string | null;
  full_name: string | null;
  status: string | null;
  raw: any;
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fmtDateTimeIT(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateIT(value: string | null | undefined) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getRawField(raw: any, key: string) {
  if (!raw || typeof raw !== "object") return "";
  const v = raw[key];
  return v === null || v === undefined ? "" : String(v).trim();
}

function pickEvent(a: AccessRow) {
  const evAny = (a as any).events as EventEmbed;
  if (!evAny) return null;
  if (Array.isArray(evAny)) return evAny[0] || null;
  return evAny;
}

function pickWhen(a: AccessRow) {
  // priorità: checkin_at -> created_at -> event.start_at
  const ev = pickEvent(a);
  return (a.checkin_at || a.created_at || ev?.start_at || null) as string | null;
}

function isCheckedInTicket(ticket: XceedTicketRow) {
  if ((ticket.status || "").trim().toLowerCase() === "checked_in") return true;

  const qrCode = String(ticket.qr_code || "").trim().toLowerCase();
  const passes = Array.isArray(ticket.raw?.booking?.passes)
    ? ticket.raw.booking.passes
    : [];
  const matchingPass = passes.find(
    (pass: any) => String(pass?.qrCode || "").trim().toLowerCase() === qrCode
  );

  return Boolean(
    matchingPass?.hasCheckedIn ||
      ticket.raw?.pass?.hasCheckedIn ||
      ticket.raw?.ticket?.hasCheckedIn ||
      ticket.raw?.hasCheckedIn
  );
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getPassIdentity(ticket: XceedTicketRow) {
  const qrCode = String(ticket.qr_code || "").trim().toLowerCase();
  const passes = Array.isArray(ticket.raw?.booking?.passes)
    ? ticket.raw.booking.passes
    : [];
  const matchingPass = passes.find(
    (pass: any) => String(pass?.qrCode || "").trim().toLowerCase() === qrCode
  );
  const passName = matchingPass
    ? `${String(matchingPass.firstName || "").trim()} ${String(
        matchingPass.lastName || ""
      ).trim()}`.trim()
    : "";

  return {
    email: String(matchingPass?.email || ticket.email || "")
      .trim()
      .toLowerCase(),
    name: normalizeIdentity(passName || ticket.full_name),
  };
}


export default async function LVPeopleAccessiPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();

  // entrypoint unico
  if (!email) redirect("/login");

  const supabase = getSupabaseAdmin();

  // 1) trova socio (LV People usa members)
  const { data: member, error: memberErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, phone, legacy, legacy_barcode, created_at, membership_group, status, membership_expires_at")
    .ilike("email", email)
    .maybeSingle<MemberRow>();

  if (memberErr) {
    return (
      <main className="min-h-screen bg-[#080008] text-white p-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-6">
            <div className="text-xl font-semibold">LV People — Accessi</div>
            <div className="mt-3 text-red-200 text-sm">Errore: {memberErr.message}</div>
            <a href="/lvpeople" className="mt-4 inline-block text-sm text-white/70 hover:text-white">
              ← Torna alla tessera
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (!member) {
    redirect("/lvpeople");
  }

  const status = member.status?.trim() || "Stato non disponibile";
  const normalizedStatus = status.toUpperCase();
  const isActive = normalizedStatus === "ATTIVA";

  let wally: WallyRow | null = null;
  if ((member.legacy_barcode || "").trim()) {
    const { data } = await supabase
      .from("wallyfor_members")
      .select("id, barcode, full_name, email, status, raw, updated_at")
      .eq("barcode", (member.legacy_barcode || "").trim())
      .maybeSingle<WallyRow>();
    wally = (data as any) || null;
  } else {
    const { data } = await supabase
      .from("wallyfor_members")
      .select("id, barcode, full_name, email, status, raw, updated_at")
      .ilike("email", email)
      .maybeSingle<WallyRow>();
    wally = (data as any) || null;
  }

  const raw = wally?.raw || null;

  const codiceGruppo = member.membership_group || getRawField(raw, "codiceGruppo") || "—";
  const validita = status;
  const dataPrimaIscrizione = fmtDateIT(getRawField(raw, "data_prima_iscrizione"));
  const scadenza = fmtDateIT(member.membership_expires_at || getRawField(raw, "scadenza"));
  const barcode = wally?.barcode || (member.legacy_barcode || "") || "—";

  // 4) carica ultimi accessi (past inclusi)
  const { data: accessData } = await supabase
    .from("checkins")
    .select(
      `
        id,
        event_id,
        checkin_at,
        created_at,
        result,
        reason,
        method,
        kind,
        scanned_code,
        events (
          name,
          city,
          venue,
          start_at
        )
      `
    )
    .eq("member_id", member.id)
    .order("checkin_at", { ascending: false })
    .limit(30);

  const accessi = (accessData ?? []) as AccessRow[];

  const ticketUsageByCheckinId = new Map<string, number>();
  const memberName = normalizeIdentity(`${member.first_name} ${member.last_name}`);
  const accessEventIds = Array.from(
    new Set(accessi.map((accesso) => accesso.event_id.trim()).filter(Boolean))
  );

  if (email && memberName && accessEventIds.length > 0) {
    const linkedTickets: XceedTicketRow[] = [];
    const ticketPageSize = 1000;

    for (let from = 0; ; from += ticketPageSize) {
      const { data: ticketPage, error: linkedTicketError } = await supabase
        .from("xceed_tickets")
        .select("event_id, transaction_id, qr_code, email, full_name, status, raw")
        .in("event_id", accessEventIds)
        .order("event_id", { ascending: true })
        .order("transaction_id", { ascending: true })
        .order("qr_code", { ascending: true })
        .range(from, from + ticketPageSize - 1);

      if (linkedTicketError) {
        linkedTickets.length = 0;
        break;
      }

      const rows = (ticketPage || []) as XceedTicketRow[];
      linkedTickets.push(...rows);
      if (rows.length < ticketPageSize) break;
    }
    const transactionsByEvent = new Map<string, Set<string>>();

    for (const ticket of linkedTickets) {
      const eventId = (ticket.event_id || "").trim();
      const transactionId = (ticket.transaction_id || "").trim();
      const passIdentity = getPassIdentity(ticket);
      if (
        !eventId ||
        !transactionId ||
        passIdentity.email !== email ||
        passIdentity.name !== memberName
      ) continue;

      const transactions = transactionsByEvent.get(eventId) || new Set<string>();
      transactions.add(transactionId);
      transactionsByEvent.set(eventId, transactions);
    }

    for (const [eventId, transactions] of transactionsByEvent.entries()) {
      if (transactions.size !== 1) continue;
      const transactionId = Array.from(transactions)[0];
      const usedTickets = linkedTickets.filter(
        (ticket) =>
          String(ticket.event_id || "").trim() === eventId &&
          String(ticket.transaction_id || "").trim() === transactionId &&
          isCheckedInTicket(ticket)
      ).length;
      if (usedTickets < 1) continue;

      for (const accesso of accessi) {
        if (accesso.event_id === eventId) {
          ticketUsageByCheckinId.set(accesso.id, usedTickets);
        }
      }
    }
  }

  // metriche
  const accessCount = accessi.length;
  const lastAccess = accessi.length > 0 ? pickWhen(accessi[0]) : null;

  // “LISTA”: numero eventi distinti (dedupe su name+start_at+venue)
  const distinctEventKeys = new Set<string>();
  for (const a of accessi) {
    const ev = pickEvent(a);
    const key = `${ev?.name || ""}__${ev?.start_at || ""}__${ev?.venue || ""}`;
    if (ev?.name) distinctEventKeys.add(key);
  }
  const listaCount = distinctEventKeys.size;

  const displayName = `${member.first_name} ${member.last_name}`.trim() || "Socio";

  return (
    <main className="min-h-screen text-white">
      <div className="min-h-screen bg-[#080008] relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-2xl opacity-60"
          style={{ background: "radial-gradient(circle, rgba(255,0,199,0.22), transparent 62%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 -right-48 h-[680px] w-[680px] rounded-full blur-2xl opacity-60"
          style={{ background: "radial-gradient(circle, rgba(255,0,126,0.18), transparent 62%)" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black" />

        <div className="relative z-10 p-6">
          <div className="max-w-5xl mx-auto">
            <header className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs tracking-[0.26em] uppercase text-white/60">LV People</div>
                <h1 className="mt-1 text-2xl font-semibold">Eventi partecipati</h1>
                <p className="mt-1 text-sm text-white/65">Il tuo profilo e lo storico degli eventi.</p>
              </div>

              <a
                href="/lvpeople"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/5 transition"
              >
                ← Torna alla tessera
              </a>
            </header>

            
            <section className="mt-6 rounded-3xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.60)] overflow-hidden">
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="text-xs tracking-[0.26em] uppercase text-white/55">Profilo</div>
                    <div className="mt-2 text-xl font-semibold">{displayName}</div>
                    <div className="mt-1 text-sm text-white/70 break-words">{member.email || "—"}</div>
                    <div className="mt-1 text-sm text-white/70 break-words">
                      {member.phone || getRawField(raw, "Telefono") || "—"}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-4">
                        <div className="text-xs tracking-[0.22em] uppercase text-white/55">Gruppo</div>
                        <div className="mt-1 text-sm font-semibold text-white/90">{codiceGruppo}</div>
                        <div className="mt-1 text-xs text-white/55">Validità: {validita}</div>
                      </div>
                      <div className="rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-4">
                        <div className="text-xs tracking-[0.22em] uppercase text-white/55">Tessera</div>
                        <div className="mt-1 text-xs text-white/60">Barcode:</div>
                        <div className="mt-1 font-mono text-xs text-white break-all">{barcode}</div>
                        <div className="mt-2 text-xs text-white/55">
                          Prima iscrizione: {dataPrimaIscrizione} · Scadenza: {scadenza}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs tracking-[0.26em] uppercase text-white/55">Stato</div>

                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2">
                          <span
                            className={[
                              "h-2 w-2 rounded-full",
                              isActive ? "bg-emerald-300" : "bg-rose-300",
                            ].join(" ")}
                          />
                          <span className="text-sm font-semibold">{status}</span>
                        </div>

                        <div className="mt-3 text-sm text-white/70">
                          Iscritto: <span className="text-white/85">{fmtDateTimeIT(member.created_at)}</span>
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                          Ultimo accesso: <span className="text-white/85">{lastAccess ? fmtDateTimeIT(lastAccess) : "—"}</span>
                        </div>
                      </div>

                      <div className="text-xs text-white/45 text-right">
                        <div>Dati aggiornati da Wallyfor</div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-4 max-w-sm">
                      <div className="rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-4 text-center">
                        <div className="text-xs tracking-[0.22em] uppercase text-white/55">Accessi</div>
                        <div className="mt-2 text-3xl font-extrabold">{accessCount}</div>
                      </div>

                      <div className="rounded-2xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 p-4 text-center">
                        <div className="text-xs tracking-[0.22em] uppercase text-white/55">Lista</div>
                        <div className="mt-2 text-3xl font-extrabold">{listaCount}</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </section>

            
            <section className="mt-6 rounded-3xl border border-fuchsia-300/15 bg-gradient-to-br from-[#20000f]/90 to-black/80 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.60)] overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <div className="text-xs tracking-[0.26em] uppercase text-white/55">Timeline</div>
                <h2 className="mt-2 text-xl font-semibold">Eventi partecipati</h2>
                <p className="mt-1 text-sm text-white/65">Data, luogo ed esito dei tuoi accessi.</p>
              </div>

              <div className="p-6">
                {accessi.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-white/70">Nessun accesso registrato.</div>
                ) : (
                  <ul className="space-y-3">
                    {accessi.map((a) => {
                      const ev = pickEvent(a);
                      const evName = ev?.name || "Evento";
                      const where = [ev?.venue, ev?.city].filter(Boolean).join(" · ");
                      const whenEvent = ev?.start_at || null;
                      const whenCheckin = pickWhen(a);

                      const ok = a.result === "allowed";
                      const badgeBorder = ok ? "border-emerald-300/30" : "border-rose-300/30";
                      const badgeBg = ok ? "bg-emerald-300/10" : "bg-rose-300/10";
                      const badgeText = ok ? "text-emerald-100" : "text-rose-100";
                      const usedTickets = ticketUsageByCheckinId.get(a.id) || 0;
                      const additionalTickets = Math.max(usedTickets - 1, 0);

                      return (
                        <li key={a.id} className="rounded-2xl border border-white/10 bg-black/20 p-5 hover:bg-white/5 transition">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="h-2 w-2 rounded-full bg-fuchsia-300 shrink-0" />
                                <div className="font-semibold truncate">{evName}</div>
                              </div>

                              <div className="mt-1 text-sm text-white/70">
                                {where ? <span className="text-white/60">{where}</span> : <span className="text-white/50">Luogo: —</span>}
                              </div>

                              <div className="mt-2 text-xs text-white/55">
                                Data evento: <span className="text-white/75">{fmtDateIT(whenEvent)}</span>
                                <span className="text-white/35"> · </span>
                                Check-in: <span className="text-white/75">{fmtDateTimeIT(whenCheckin)}</span>
                              </div>

                              {ok ? (
                                <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/5 px-3 py-2.5">
                                  <div className="text-xs text-emerald-100">
                                    Ingresso personale: <span className="font-semibold">confermato</span>
                                  </div>

                                  {additionalTickets > 0 ? (
                                    <>
                                      <div className="mt-1 text-xs text-white/65">
                                        Biglietti utilizzati nella prenotazione:{" "}
                                        <span className="font-semibold text-white/85">{usedTickets}</span>
                                      </div>
                                      <div className="mt-1 text-xs text-white/50">
                                        1 presenza personale · {additionalTickets}{" "}
                                        {additionalTickets === 1 ? "biglietto aggiuntivo" : "biglietti aggiuntivi"}
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={[
                                  "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold border",
                                  badgeBorder,
                                  badgeBg,
                                  badgeText,
                                ].join(" ")}
                              >
                                {ok ? "Accesso registrato" : "Accesso negato"}
                              </span>

                              {a.scanned_code ? (
                                <div className="mt-2 text-[11px] font-mono text-white/40 max-w-[220px] break-all">{a.scanned_code}</div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="mt-6 flex items-center justify-between gap-4">
                  <a
                    href="/lvpeople"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs tracking-[0.22em] uppercase text-white/80 hover:text-white hover:bg-white/5 transition"
                  >
                    ← Torna alla tessera
                  </a>

                  <div className="text-xs text-white/40">Solo tu e lo staff autorizzato potete vedere questi dati.</div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}
