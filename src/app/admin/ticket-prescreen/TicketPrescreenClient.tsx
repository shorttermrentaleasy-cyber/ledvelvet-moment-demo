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

type MembershipCategory = "active_member" | "inactive_member" | "non_member";
type EmailGroupCategory = MembershipCategory | "mixed";
type Filter = MembershipCategory | "anomalies" | "all";

type AnomalyType =
  | "inactive_membership"
  | "non_member"
  | "possible_duplicate"
  | "identity_review";

type AnomalyStatus =
  | "open"
  | "in_progress"
  | "waiting_participant"
  | "resolved"
  | "archived";

type AnomalyHistory = {
  id: number;
  status: AnomalyStatus;
  note: string | null;
  admin_email: string;
  created_at: string;
};

type AnomalyRecord = {
  id: string;
  event_id: string;
  ticket_ref: string;
  anomaly_type: AnomalyType;
  status: AnomalyStatus;
  member_id: string | null;
  admin_note: string | null;
  assigned_admin_email: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  history: AnomalyHistory[];
};

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

type EmailGroup = {
  key: string;
  email: string | null;
  orderGroups: RowGroup[];
  totalOrders: number;
  totalTickets: number;
};

const resultStyles: Record<Result, string> = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  inactive: "border-amber-300/40 bg-amber-300/15 text-amber-100",
  not_found: "border-red-400/30 bg-red-400/10 text-red-200",
  review: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  cancelled: "border-white/15 bg-white/5 text-white/50",
};

const anomalyTypeLabels: Record<AnomalyType, string> = {
  inactive_membership: "Tessera non attiva",
  non_member: "Partecipante non socio",
  possible_duplicate: "Tessera già usata per un altro biglietto",
  identity_review: "Identità da verificare",
};

const anomalyStatusLabels: Record<AnomalyStatus, string> = {
  open: "Da gestire",
  in_progress: "In lavorazione",
  waiting_participant: "In attesa del partecipante",
  resolved: "Risolta",
  archived: "Archiviata",
};

const emailGroupStyles: Record<
  EmailGroupCategory,
  { container: string; header: string; badge: string; label: string }
> = {
  active_member: {
    container: "border-emerald-400/35 bg-emerald-400/[0.045]",
    header: "border-emerald-400/25 bg-emerald-400/[0.12]",
    badge: "border-emerald-300/40 bg-emerald-300/15 text-emerald-100",
    label: "Socio attivo · Tessera attiva",
  },
  inactive_member: {
    container: "border-amber-300/40 bg-amber-300/[0.055]",
    header: "border-amber-300/30 bg-amber-300/[0.14]",
    badge: "border-amber-300/45 bg-amber-300/20 text-amber-100",
    label: "Socio · Tessera non attiva",
  },
  non_member: {
    container: "border-orange-400/40 bg-orange-400/[0.055]",
    header: "border-orange-400/30 bg-orange-400/[0.14]",
    badge: "border-orange-300/45 bg-orange-300/20 text-orange-100",
    label: "Non socio",
  },
  mixed: {
    container: "border-cyan-300/25 bg-cyan-300/[0.025]",
    header: "border-cyan-300/20 bg-cyan-300/[0.08]",
    badge: "border-cyan-300/35 bg-cyan-300/15 text-cyan-100",
    label: "Stati diversi",
  },
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime
    ? date.toLocaleString("it-IT")
    : date.toLocaleDateString("it-IT");
}

function normalizedEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function participantEmail(row: Row) {
  return normalizedEmail(row.participant.email);
}

function hasInactiveMembership(row: Row) {
  const status = row.member?.status?.trim().toLowerCase().replace(/[_-]+/g, " ");
  return Boolean(
    row.member &&
      (row.result === "inactive" || status === "non attiva" || status === "inactive")
  );
}

function membershipCategory(row: Row): MembershipCategory {
  if (!row.member) return "non_member";
  return hasInactiveMembership(row) ? "inactive_member" : "active_member";
}

function anomalyType(row: Row): AnomalyType | null {
  if (row.ticket_status === "cancelled") return null;
  if (row.coverage_status === "possible_duplicate") return "possible_duplicate";
  if (hasInactiveMembership(row)) return "inactive_membership";
  if (!row.member) return "non_member";
  if (row.result === "review") return "identity_review";
  return null;
}

function isClosedAnomaly(anomaly: AnomalyRecord | undefined) {
  return anomaly?.status === "resolved" || anomaly?.status === "archived";
}

function emailGroupCategory(group: EmailGroup): EmailGroupCategory {
  const categories = new Set(
    group.orderGroups.flatMap((orderGroup) =>
      orderGroup.rows.map((row) => membershipCategory(row))
    )
  );
  return categories.size === 1
    ? (Array.from(categories)[0] as MembershipCategory)
    : "mixed";
}

function groupPurchasedAt(group: RowGroup) {
  const timestamps = group.rows
    .map((row) => (row.purchased_at ? new Date(row.purchased_at).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));
  return timestamps.length ? Math.min(...timestamps) : Number.POSITIVE_INFINITY;
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
  const [anomalies, setAnomalies] = useState<Record<string, AnomalyRecord>>({});
  const [managementWarning, setManagementWarning] = useState("");
  const [selectedTicketRef, setSelectedTicketRef] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<AnomalyStatus>("open");
  const [draftNote, setDraftNote] = useState("");
  const [savingAnomaly, setSavingAnomaly] = useState(false);

  useEffect(() => {
    fetchJson("/api/admin/ticket-prescreen")
      .then((payload) => setEvents(payload.events || []))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Errore"))
      .finally(() => setLoadingEvents(false));
  }, []);

  const openAnomalyRows = useMemo(
    () =>
      rows.filter((row) => {
        const detected = anomalyType(row);
        return detected && !isClosedAnomaly(anomalies[row.ticket_ref]);
      }),
    [anomalies, rows]
  );

  const visibleRows = useMemo(
    () =>
      filter === "all"
        ? rows
        : filter === "anomalies"
          ? openAnomalyRows
          : rows.filter((row) => membershipCategory(row) === filter),
    [filter, openAnomalyRows, rows]
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

  const visibleEmailGroups = useMemo(() => {
    const groupsByEmail = new Map<string, RowGroup[]>();
    for (const group of visibleGroups) {
      const rowsByEmail = new Map<string, Row[]>();
      for (const row of group.rows) {
        const email = participantEmail(row);
        const key = email ? `email:${email}` : "email:missing";
        rowsByEmail.set(key, [...(rowsByEmail.get(key) || []), row]);
      }

      for (const [key, emailRows] of rowsByEmail) {
        const coveredMemberIds = new Set(
          emailRows
            .filter((row) => row.first_purchase && row.member?.id)
            .map((row) => row.member!.id)
        );
        const nonCancelledTickets = emailRows.filter(
          (row) => row.ticket_status !== "cancelled"
        ).length;
        const emailOrderGroup: RowGroup = {
          key: `${group.key}:${key}`,
          orderRef: group.orderRef,
          rows: emailRows,
          totalTickets: emailRows.length,
          nonCancelledTickets,
          coveredTickets: coveredMemberIds.size,
          uncoveredTickets: Math.max(0, nonCancelledTickets - coveredMemberIds.size),
          hasUnidentifiedCoverage: emailRows.some(
            (row) => row.coverage_status === "unidentified"
          ),
          hasPossibleDuplicate: emailRows.some(
            (row) => row.coverage_status === "possible_duplicate"
          ),
        };
        groupsByEmail.set(key, [
          ...(groupsByEmail.get(key) || []),
          emailOrderGroup,
        ]);
      }
    }

    return Array.from(groupsByEmail.entries())
      .map(([key, orderGroups]): EmailGroup => {
        const sortedGroups = [...orderGroups].sort((a, b) => {
          const byDate = groupPurchasedAt(a) - groupPurchasedAt(b);
          if (byDate !== 0) return byDate;
          return (a.orderRef || a.key).localeCompare(b.orderRef || b.key, "it");
        });
        return {
          key,
          email: key === "email:missing" ? null : key.slice("email:".length),
          orderGroups: sortedGroups,
          totalOrders: sortedGroups.length,
          totalTickets: sortedGroups.reduce(
            (total, group) => total + group.totalTickets,
            0
          ),
        };
      })
      .sort((a, b) => {
        if (!a.email) return 1;
        if (!b.email) return -1;
        return a.email.localeCompare(b.email, "it", { sensitivity: "base" });
      });
  }, [visibleGroups]);

  async function loadAnomalies(selectedId: string) {
    setManagementWarning("");
    try {
      const payload = await fetchJson(
        `/api/admin/ticket-prescreen/anomalies?event_id=${encodeURIComponent(selectedId)}&t=${Date.now()}`
      );
      const next = Object.fromEntries(
        (payload.anomalies || []).map((item: AnomalyRecord) => [item.ticket_ref, item])
      );
      setAnomalies(next);
    } catch (reason) {
      setAnomalies({});
      setManagementWarning(
        reason instanceof Error
          ? `Gestione anomalie non disponibile: ${reason.message}`
          : "Gestione anomalie non disponibile"
      );
    }
  }

  function openAnomalyManager(row: Row) {
    const existing = anomalies[row.ticket_ref];
    setSelectedTicketRef(row.ticket_ref);
    setDraftStatus(existing?.status || "open");
    setDraftNote(existing?.admin_note || "");
  }

  async function saveAnomaly(row: Row) {
    const detectedType = anomalyType(row);
    if (!eventId || !detectedType) return;
    setSavingAnomaly(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ticket-prescreen/anomalies", {
        method: "PUT",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          ticket_ref: row.ticket_ref,
          anomaly_type: detectedType,
          status: draftStatus,
          note: draftNote,
          member_id: row.member?.id || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Errore HTTP ${response.status}`);
      }
      const saved = payload.anomaly as AnomalyRecord;
      setAnomalies((current) => ({ ...current, [saved.ticket_ref]: saved }));
      setManagementWarning("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore nel salvataggio");
    } finally {
      setSavingAnomaly(false);
    }
  }

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
      setSelectedTicketRef(null);
      await loadAnomalies(selectedId);
    } catch (reason) {
      setEvent(null);
      setSummary(null);
      setRows([]);
      setAnomalies({});
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
    { key: "uncovered_tickets", label: "Biglietti non coperti", color: "text-amber-200" },
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
                Xceed e Wallyfor non vengono modificati; sono salvate solo le decisioni dell’amministratore.
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">Controllo partecipanti</h2>
                    <span className="rounded-full border border-fuchsia-300/35 bg-fuchsia-300/10 px-3 py-1 text-xs font-semibold text-fuchsia-100">
                      {openAnomalyRows.length} {openAnomalyRows.length === 1 ? "anomalia aperta" : "anomalie aperte"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    “Regolare” significa pre-controllo superato sui dati dichiarati nel biglietto.
                  </p>
                </div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Filter)}
                  className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                >
                  <option value="all">Tutti gli acquisti</option>
                  <option value="active_member">Acquisti soci attivi</option>
                  <option value="inactive_member">Acquisti soci non attivi</option>
                  <option value="non_member">Acquisti non soci</option>
                  <option value="anomalies">Anomalie da gestire ({openAnomalyRows.length})</option>
                </select>
              </div>

              {managementWarning && (
                <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                  {managementWarning}
                </div>
              )}

              <div className="space-y-6">
                {visibleEmailGroups.map((emailGroup) => (
                  <div
                    key={emailGroup.key}
                    className={`overflow-hidden rounded-3xl border ${emailGroupStyles[emailGroupCategory(emailGroup)].container}`}
                  >
                    <div className={`flex flex-col gap-2 border-b px-4 py-4 md:flex-row md:items-center md:justify-between ${emailGroupStyles[emailGroupCategory(emailGroup)].header}`}>
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                          Email partecipante
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="break-all font-semibold text-white">
                            {emailGroup.email || "Senza email"}
                          </div>
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${emailGroupStyles[emailGroupCategory(emailGroup)].badge}`}>
                            {emailGroupStyles[emailGroupCategory(emailGroup)].label}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-white/60">
                        {emailGroup.totalOrders}{" "}
                        {emailGroup.totalOrders === 1 ? "acquisto" : "acquisti"} ·{" "}
                        {emailGroup.totalTickets}{" "}
                        {emailGroup.totalTickets === 1 ? "biglietto" : "biglietti"}
                      </div>
                    </div>
                    <div className="space-y-4 p-3 md:p-4">
                      {emailGroup.orderGroups.map((group) => (
                        <div
                          key={group.key}
                          className="overflow-hidden rounded-2xl border border-white/10 bg-black/25"
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
                            {group.uncoveredTickets} {group.uncoveredTickets === 1 ? "non coperto" : "non coperti"}
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
                          className={`grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr] ${
                            hasInactiveMembership(row)
                              ? "border-l-4 border-amber-300 bg-amber-400/20 ring-1 ring-inset ring-amber-300/50"
                              : ""
                          }`}
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
                      <span
                        className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          hasInactiveMembership(row)
                            ? resultStyles.inactive
                            : resultStyles[row.result]
                        }`}
                      >
                        {hasInactiveMembership(row)
                          ? "Tessera non attiva"
                          : row.result_label}
                      </span>
                      <div
                        className={`mt-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                          hasInactiveMembership(row)
                            ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                            : row.coverage_status === "covered"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : row.coverage_status === "unidentified"
                              ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                              : row.coverage_status === "possible_duplicate"
                                ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                              : "border-white/10 bg-white/[0.035] text-white/55"
                        }`}
                      >
                        {hasInactiveMembership(row)
                          ? "Socio riconosciuto · Acquisto corretto · Biglietto non coperto"
                          : row.coverage_label}
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
                        <div key={warning} className="mt-2 text-xs leading-5 text-amber-100/80">
                          • {hasInactiveMembership(row) ? "Nota secondaria: " : ""}
                          {warning}
                        </div>
                      ))}
                      {anomalyType(row) && (
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => openAnomalyManager(row)}
                            className="rounded-xl border border-fuchsia-300/35 bg-fuchsia-300/10 px-3 py-2 text-xs font-semibold text-fuchsia-100"
                          >
                            Gestisci anomalia
                          </button>
                          <div className="text-xs text-white/45">
                            {anomalies[row.ticket_ref]
                              ? `${anomalyTypeLabels[anomalyType(row)!]} · ${anomalyStatusLabels[anomalies[row.ticket_ref].status]}`
                              : `${anomalyTypeLabels[anomalyType(row)!]} · Non ancora presa in carico`}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedTicketRef === row.ticket_ref && anomalyType(row) && (
                      <div className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/[0.07] p-4 lg:col-span-4">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-fuchsia-100">
                              {anomalyTypeLabels[anomalyType(row)!]}
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              La decisione è manuale e non modifica Xceed, Wallyfor o Fast Check.
                            </div>
                          </div>
                          <button type="button" onClick={() => setSelectedTicketRef(null)} className="text-left text-xs text-white/50 md:text-right">
                            Chiudi pannello
                          </button>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-[260px_1fr_auto] md:items-end">
                          <label className="text-xs text-white/55">
                            Stato
                            <select
                              value={draftStatus}
                              onChange={(e) => setDraftStatus(e.target.value as AnomalyStatus)}
                              className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                            >
                              {Object.entries(anomalyStatusLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-white/55">
                            Nota amministratore
                            <textarea
                              value={draftNote}
                              maxLength={2000}
                              onChange={(e) => setDraftNote(e.target.value)}
                              placeholder="Verifica effettuata, contatto o motivazione…"
                              className="mt-1 min-h-20 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={savingAnomaly}
                            onClick={() => void saveAnomaly(row)}
                            className="rounded-xl bg-fuchsia-300 px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
                          >
                            {savingAnomaly ? "Salvataggio…" : "Salva"}
                          </button>
                        </div>
                        {(anomalies[row.ticket_ref]?.history || []).length > 0 && (
                          <div className="mt-4 border-t border-white/10 pt-3">
                            <div className="text-xs uppercase tracking-[0.14em] text-white/40">Storico decisioni</div>
                            <div className="mt-2 space-y-2">
                              {anomalies[row.ticket_ref].history.map((item) => (
                                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                                  <span className="font-semibold text-white/80">{anomalyStatusLabels[item.status]}</span>
                                  {" · "}{formatDate(item.created_at, true)}
                                  {" · "}{item.admin_email}
                                  {item.note ? ` · ${item.note}` : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                        </article>
                      ))}
                    </div>
                        </div>
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
