"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EventItem = {
  id: string;
  name: string;
  starts_at: string | null;
  venue: string | null;
  city: string | null;
};

type Result =
  | "active"
  | "inactive"
  | "not_found"
  | "review"
  | "cancelled";

type Filter = Result | "repeated_identity" | "possible_duplicate" | "all";

type Row = {
  ticket_ref: string;
  order_ref: string | null;
  purchased_at: string | null;
  ticket_status: "active" | "checked_in" | "cancelled";
  participant: { full_name: string | null; email: string | null; phone: string | null };
  buyer: { full_name: string | null; email: string | null; phone: string | null } | null;
  result: Result;
  result_label: string;
  identity_repeated: boolean;
  identity_ticket_count: number | null;
  coverage_status: "covered" | "uncovered" | "unidentified" | "possible_duplicate";
  coverage_label: string;
  first_purchase: boolean;
  matched_by: "email+phone" | "email" | "phone" | null;
  warnings: string[];
  member: {
    id: string;
    barcode: string | null;
    full_name: string | null;
    membership_group: string | null;
    status: string | null;
    membership_expires_at: string | null;
  } | null;
};

type Summary = Record<
  Result |
    "repeated_identity" |
    "active_members" |
    "covered_tickets" |
    "uncovered_tickets" |
    "possible_duplicates" |
    "total",
  number
>;

type RowGroup = {
  key: string;
  orderRef: string | null;
  rows: Row[];
  totalTickets: number;
  nonCancelledTickets: number;
  coveredTickets: number;
  uncoveredTickets: number;
  hasUnidentifiedCoverage: boolean;
  hasPossibleDuplicate: boolean;
};

const resultStyles: Record<Result, string> = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  inactive: "border-red-400/30 bg-red-400/10 text-red-200",
  not_found: "border-red-400/30 bg-red-400/10 text-red-200",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  cancelled: "border-white/15 bg-white/5 text-white/50",
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime
    ? date.toLocaleString("it-IT")
    : date.toLocaleDateString("it-IT");
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Errore HTTP ${response.status}`);
  }
  return payload;
}

export default function TicketPrescreenClient() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState("");
  const [event, setEvent] = useState<EventItem | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetchJson("/api/admin/ticket-prescreen")
      .then((payload) => setEvents(payload.events || []))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Errore"))
      .finally(() => setLoadingEvents(false));
  }, []);

  const visibleRows = useMemo(
    () =>
      filter === "all"
        ? rows
        : filter === "repeated_identity"
          ? rows.filter((row) => row.identity_repeated)
          : filter === "possible_duplicate"
            ? rows.filter((row) => row.coverage_status === "possible_duplicate")
          : rows.filter((row) => row.result === filter),
    [filter, rows]
  );

  const visibleGroups = useMemo(() => {
    const rowsByGroup = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.order_ref ? `order:${row.order_ref}` : `ticket:${row.ticket_ref}`;
      rowsByGroup.set(key, [...(rowsByGroup.get(key) || []), row]);
    }

    const visibleKeys = new Set(
      visibleRows.map((row) =>
        row.order_ref ? `order:${row.order_ref}` : `ticket:${row.ticket_ref}`
      )
    );
    return Array.from(rowsByGroup.entries())
      .filter(([key]) => visibleKeys.has(key))
      .map(([key, groupRows]): RowGroup => {
        const coveredMemberIds = new Set(
          groupRows
            .filter((row) => row.first_purchase && row.member?.id)
            .map((row) => row.member!.id)
        );
        const coveredTickets = coveredMemberIds.size;
        const nonCancelled = groupRows.filter(
          (row) => row.ticket_status !== "cancelled"
        ).length;
        return {
          key,
          orderRef: groupRows[0]?.order_ref || null,
          rows: groupRows.filter((row) => visibleRows.includes(row)),
          totalTickets: groupRows.length,
          nonCancelledTickets: nonCancelled,
          coveredTickets,
          uncoveredTickets: Math.max(0, nonCancelled - coveredTickets),
          hasUnidentifiedCoverage: groupRows.some(
            (row) => row.coverage_status === "unidentified"
          ),
          hasPossibleDuplicate: groupRows.some(
            (row) => row.coverage_status === "possible_duplicate"
          ),
        };
      });
  }, [rows, visibleRows]);

  async function loadPrescreen(selectedId = eventId) {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    setFilter("all");
    try {
      const payload = await fetchJson(
        `/api/admin/ticket-prescreen?event_id=${encodeURIComponent(selectedId)}&t=${Date.now()}`
      );
      setEvent(payload.event || null);
      setSummary(payload.summary || null);
      setRows(payload.rows || []);
      setGeneratedAt(payload.generated_at || null);
    } catch (reason) {
      setEvent(null);
      setSummary(null);
      setRows([]);
      setGeneratedAt(null);
      setError(reason instanceof Error ? reason.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }

  const cards: Array<{ key: keyof Summary; label: string; color: string }> = [
    { key: "total", label: "Biglietti", color: "text-white" },
    { key: "active_members", label: "Tessere attive", color: "text-emerald-300" },
    { key: "covered_tickets", label: "Biglietti coperti", color: "text-emerald-300" },
    { key: "uncovered_tickets", label: "Da associare", color: "text-amber-200" },
    { key: "inactive", label: "Non attivi", color: "text-red-300" },
    { key: "not_found", label: "Non trovati", color: "text-red-300" },
    { key: "review", label: "Da verificare", color: "text-amber-200" },
    { key: "repeated_identity", label: "Identità ripetute", color: "text-amber-200" },
    { key: "possible_duplicates", label: "Possibili doppioni", color: "text-amber-200" },
  ];

  return (
    <main className="min-h-screen bg-[#070812] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#18172b] to-[#09090d] p-5 shadow-2xl md:p-7">
          <Link
            href="/admin"
            className="mb-5 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100"
          >
            ← Dashboard
          </Link>
          <div className="grid gap-5 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                LED VELVET • ADMIN
              </div>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">Pre-controllo biglietti</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Lettura live delle vendite Xceed e confronto con l’anagrafica Wallyfor.
                Nessun dato viene modificato o salvato.
              </p>
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/50">
                Evento Xceed
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={eventId}
                  disabled={loadingEvents || loading}
                  onChange={(e) => setEventId(e.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
                >
                  <option value="">Seleziona evento</option>
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.starts_at ? ` · ${formatDate(item.starts_at)}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!eventId || loading}
                  onClick={() => void loadPrescreen()}
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Controllo…" : rows.length ? "Aggiorna" : "Controlla"}
                </button>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {event && summary && (
          <>
            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{event.name}</h2>
                  <p className="mt-1 text-sm text-white/50">
                    {[formatDate(event.starts_at), event.venue, event.city]
                      .filter((value) => value && value !== "—")
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-xs text-white/40">
                  Lettura aggiornata: {formatDate(generatedAt, true)}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {cards.map((card) => (
                  <div key={card.key} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-white/45">{card.label}</div>
                    <div className={`mt-2 text-3xl font-bold ${card.color}`}>
                      {Number(summary[card.key] || 0).toLocaleString("it-IT")}
                    </div>
                  </div>
                ))}
              </div>
              {summary.cancelled > 0 && (
                <p className="mt-3 text-xs text-white/45">
                  Biglietti annullati: {summary.cancelled.toLocaleString("it-IT")}
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Controllo partecipanti</h2>
                  <p className="mt-1 text-xs text-white/45">
                    “Regolare” significa pre-controllo superato sui dati dichiarati nel biglietto.
                  </p>
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Filter)}
                  className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                >
                  <option value="all">Tutti gli esiti</option>
                  <option value="active">Soci attivi</option>
                  <option value="inactive">Tessere non attive</option>
                  <option value="not_found">Non trovati</option>
                  <option value="review">Da verificare</option>
                  <option value="repeated_identity">Identità ripetute</option>
                  <option value="possible_duplicate">Possibili doppioni</option>
                  <option value="cancelled">Annullati</option>
                </select>
              </div>

              <div className="space-y-5">
                {visibleGroups.map((group) => (
                  <div
                    key={group.key}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-black/20"
                  >
                    <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-white/40">
                          {group.orderRef ? `Ordine ${group.orderRef}` : "Biglietto singolo"}
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                          {group.totalTickets} {group.totalTickets === 1 ? "biglietto" : "biglietti"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
                          {group.coveredTickets} {group.coveredTickets === 1 ? "coperto" : "coperti"}
                        </span>
                        {group.uncoveredTickets > 0 && (
                          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-amber-100">
                            {group.uncoveredTickets} da associare
                          </span>
                        )}
                      </div>
                    </div>
                    {group.hasUnidentifiedCoverage && (
                      <div className="border-b border-amber-300/15 bg-amber-300/[0.07] px-4 py-3 text-xs leading-5 text-amber-100">
                        {group.coveredTickets > 0
                          ? `${group.coveredTickets} ${group.coveredTickets === 1 ? "biglietto coperto" : "biglietti coperti"} su ${group.nonCancelledTickets}; QR personale non identificabile dai dati Xceed ripetuti.`
                          : "La tessera è attiva, ma la data Xceed non consente di determinare con certezza il primo acquisto."}
                      </div>
                    )}
                    {group.hasPossibleDuplicate && (
                      <div className="border-b border-amber-300/15 bg-amber-300/[0.07] px-4 py-3 text-xs font-semibold leading-5 text-amber-100">
                        Acquisto successivo con una tessera già associata al primo biglietto dell’evento: da controllare.
                      </div>
                    )}
                    <div className="divide-y divide-white/10">
                      {group.rows.map((row, index) => (
                        <article
                          key={`${row.ticket_ref}-${index}`}
                          className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr]"
                        >
                    <div>
                      <div className="font-semibold">{row.participant.full_name || "Senza nominativo"}</div>
                      <div className="mt-1 text-sm text-white/55">{row.participant.email || "Email assente"}</div>
                      <div className="text-sm text-white/55">{row.participant.phone || "Telefono assente"}</div>
                      <div className="mt-2 text-xs text-white/35">
                        Ticket {row.ticket_ref} · Ordine {row.order_ref || "—"}
                      </div>
                    </div>

                    <div className="text-sm">
                      <div className="text-xs uppercase tracking-[0.14em] text-white/35">Acquirente</div>
                      <div className="mt-2 text-white/80">{row.buyer?.full_name || "—"}</div>
                      <div className="mt-1 break-all text-xs text-white/45">{row.buyer?.email || "—"}</div>
                      <div className="mt-1 text-xs text-white/45">{formatDate(row.purchased_at, true)}</div>
                    </div>

                    <div className="text-sm">
                      <div className="text-xs uppercase tracking-[0.14em] text-white/35">Tessera</div>
                      <div className="mt-2 text-white/80">{row.member?.full_name || "—"}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {[row.member?.membership_group, row.member?.status].filter(Boolean).join(" · ") || "Nessuna corrispondenza"}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Scadenza: {formatDate(row.member?.membership_expires_at || null)}
                      </div>
                    </div>

                    <div>
                      <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${resultStyles[row.result]}`}>
                        {row.result_label}
                      </span>
                      <div
                        className={`mt-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                          row.coverage_status === "covered"
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : row.coverage_status === "unidentified"
                              ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                              : row.coverage_status === "possible_duplicate"
                                ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                              : "border-white/10 bg-white/[0.035] text-white/55"
                        }`}
                      >
                        {row.coverage_label}
                      </div>
                      {row.identity_repeated && (
                        <div className="mt-2 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                          Identità ripetuta su {row.identity_ticket_count} biglietti
                        </div>
                      )}
                      {row.matched_by && (
                        <div className="mt-2 text-xs text-white/40">
                          Collegato tramite {row.matched_by === "email+phone" ? "email + telefono" : row.matched_by}
                        </div>
                      )}
                      {row.warnings.map((warning) => (
                        <div key={warning} className="mt-2 text-xs leading-5 text-amber-100/80">• {warning}</div>
                      ))}
                    </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {!visibleRows.length && (
                <div className="rounded-2xl border border-white/10 p-8 text-center text-sm text-white/45">
                  Nessun biglietto per questo filtro.
                </div>
              )}
            </section>
          </>
        )}

        {!event && !error && !loading && (
          <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-sm text-white/45">
            Seleziona un evento per leggere in tempo reale i biglietti già venduti.
          </div>
        )}
      </div>
    </main>
  );
}
