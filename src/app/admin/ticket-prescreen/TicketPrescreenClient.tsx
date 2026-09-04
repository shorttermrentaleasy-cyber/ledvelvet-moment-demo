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

type MembershipCategory = "active_member" | "inactive_member" | "non_member" | "identity_review";
type EmailGroupCategory = MembershipCategory | "mixed";
type Filter = MembershipCategory | "anomalies" | "resolved" | "all";
type WorkFilter =
  | "all"
  | "not_started"
  | "ready_to_send"
  | "waiting_reply"
  | "in_progress"
  | "resolved";

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

type AnomalyActionPreset = {
  id: string;
  label: string;
  status: AnomalyStatus;
  note: string;
};

type EmailDraft = {
  recipient: string;
  subject: string;
  text: string;
};

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
  matched_by: "email+phone" | "email" | "phone" | "admin_override" | null;
  warnings: string[];
  name_candidates: MemberCandidate[];
  member: {
    id: string;
    barcode: string | null;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    membership_group: string | null;
    status: string | null;
    membership_expires_at: string | null;
  } | null;
};

type MemberCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  membership_expires_at: string | null;
};

type Summary = Record<
  Result |
    "repeated_identity" |
    "active_members" |
    "inactive_members" |
    "non_member_participants" |
    "review_participants" |
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

const anomalyActionPresets: Record<AnomalyType, AnomalyActionPreset[]> = {
  inactive_membership: [
    {
      id: "invite_renewal",
      label: "Invita al rinnovo della tessera",
      status: "waiting_participant",
      note:
        "Inviare al partecipante il link per rinnovare la tessera. Verificare l’attivazione prima dell’evento.",
    },
    {
      id: "wait_membership_update",
      label: "Attendi aggiornamento dello stato tessera",
      status: "in_progress",
      note:
        "Rinnovo già comunicato: attendere l’aggiornamento dello stato della tessera e ricontrollare prima dell’evento.",
    },
  ],
  non_member: [
    {
      id: "invite_membership",
      label: "Invita a presentare domanda di ammissione",
      status: "waiting_participant",
      note:
        "Inviare al partecipante il link per presentare la domanda di ammissione a LED Velvet. Verificare l’attivazione della tessera prima dell’evento.",
    },
    {
      id: "confirm_participant_data",
      label: "Richiedi conferma dei dati inseriti",
      status: "waiting_participant",
      note:
        "Richiedere al partecipante la conferma di nome, cognome, email e cellulare indicati sul biglietto.",
    },
  ],
  possible_duplicate: [
    {
      id: "request_actual_participant",
      label: "Richiedi i dati del partecipante effettivo",
      status: "waiting_participant",
      note:
        "Richiedere nome, cognome, email e cellulare del partecipante effettivo del secondo biglietto.",
    },
    {
      id: "check_duplicate_purchase",
      label: "Verifica possibile acquisto duplicato",
      status: "in_progress",
      note:
        "Verificare con l’acquirente se si tratta di un acquisto duplicato oppure di un biglietto destinato a un altro socio.",
    },
  ],
  identity_review: [
    {
      id: "verify_contacts",
      label: "Richiedi verifica di email e cellulare",
      status: "waiting_participant",
      note:
        "Richiedere la conferma dell’email e del cellulare del partecipante per identificare il socio corretto.",
    },
    {
      id: "match_correct_member",
      label: "Conferma identità e associa alla tessera",
      status: "resolved",
      note:
        "Identità verificata dall’amministratore. Biglietto associato alla Tessera Clubber Led Velvet indicata nel pre-controllo.",
    },
  ],
};

const noActionPreset: AnomalyActionPreset = {
  id: "no_action_required",
  label: "Nessuna azione necessaria · verificato dall’admin",
  status: "resolved",
  note:
    "Anomalia verificata dall’amministratore: nessuna azione necessaria.",
};

const MEMBERSHIP_REQUEST_URL =
  "https://wallyfor.com/iframepass/index.php?ref=1d7439beb34f751e1db481e40592079e&agenteget=";

function renewalUrl(barcode: string | null | undefined) {
  const value = barcode?.trim();
  return value
    ? `https://wallyfor.com/rinnovi/step3.php?idcode=5355&msg=${encodeURIComponent(value)}&imp=`
    : null;
}

function emailDraftFor(type: AnomalyType, row: Row, event: EventItem | null): EmailDraft {
  const recipient = row.buyer?.email?.trim().toLowerCase() || row.participant.email?.trim().toLowerCase() || "";
  const memberEmail = row.member?.email?.trim().toLowerCase();
  const name =
    (memberEmail && memberEmail === recipient ? row.member?.full_name?.trim() : null) ||
    row.buyer?.full_name?.trim() ||
    row.participant.full_name?.trim();
  const greeting = name ? `Ciao ${name},` : "Ciao,";
  const eventName = event?.name?.trim() || "l’evento LEDVELVET";
  const signature = "Grazie,\nStaff LEDVELVET";

  if (type === "inactive_membership") {
    const link = renewalUrl(row.member?.barcode);
    return {
      recipient,
      subject: `Rinnovo Tessera Clubber Led Velvet · ${eventName}`,
      text: `${greeting}\n\nti contattiamo in merito al tuo biglietto per ${eventName}.\nLa tua Tessera Clubber Led Velvet risulta non attiva.\n\n${
        link
          ? `Completa il rinnovo con un clic da questo link per poter accedere ai prossimi eventi:\n${link}`
          : "Contattaci per ricevere il link personale di rinnovo."
      }\n\nDopo il rinnovo verificheremo automaticamente l’aggiornamento della tessera.\n\nL'attivazione avrà validità un anno dal momento dell'acquisto.\n\n${signature}`,
    };
  }

  if (type === "non_member") {
    return {
      recipient,
      subject: `Attivazione Tessera Clubber Led Velvet · ${eventName}`,
      text: `${greeting}\n\nti contattiamo in merito al tuo biglietto per ${eventName}.\nDai dati inseriti non risulta una Tessera Clubber Led Velvet associata.\n\nClicca il link qui sotto per ottenerla e poter accedere ai prossimi eventi:\n${MEMBERSHIP_REQUEST_URL}\n\nSenza la tessera non sarà possibile entrare.\nUna volta completata la procedura, verificheremo l’aggiornamento prima dell’evento.\n\nL'attivazione avrà validità un anno dal momento dell'acquisto.\n\n${signature}`,
    };
  }

  if (type === "possible_duplicate") {
    const participant = row.participant.full_name?.trim() || "un partecipante da identificare";
    return {
      recipient,
      subject: `Verifica partecipante · ${eventName}`,
      text: `${greeting}\n\nti contattiamo in merito ai biglietti per ${eventName}. Il biglietto intestato a ${participant} non può essere coperto dalla stessa Tessera Clubber Led Velvet già utilizzata per un altro biglietto dell’evento.\n\nTi chiediamo di rispondere a questa email indicando nome, cognome, email e cellulare del partecipante effettivo.\n\n${signature}`,
    };
  }

  const participant = row.participant.full_name?.trim() || "il partecipante indicato";
  return {
    recipient,
    subject: `Verifica dati partecipante · ${eventName}`,
    text: `${greeting}\n\nti contattiamo in merito al biglietto per ${eventName} intestato a ${participant}. Per identificare correttamente la Tessera Clubber Led Velvet abbiamo bisogno di verificare i dati del partecipante.\n\nTi chiediamo di rispondere a questa email confermando nome, cognome, email e cellulare.\n\n${signature}`,
  };
}

function participantMembershipDraftFor(
  row: Row,
  event: EventItem | null
): EmailDraft {
  const recipient =
    row.buyer?.email?.trim().toLowerCase() ||
    row.participant.email?.trim().toLowerCase() ||
    "";
  const buyerName = row.buyer?.full_name?.trim();
  const memberEmail = row.member?.email?.trim().toLowerCase();
  const recipientName =
    (memberEmail && memberEmail === recipient ? row.member?.full_name?.trim() : null) ||
    buyerName;
  const participant = row.participant.full_name?.trim() || "il partecipante indicato";
  const eventName = event?.name?.trim() || "l’evento LEDVELVET";
  return {
    recipient,
    subject: `Tessera del partecipante · ${eventName}`,
    text: `${recipientName ? `Ciao ${recipientName},` : "Ciao,"}\n\nti contattiamo in merito al biglietto per ${eventName} intestato a ${participant}.\nDai dati verificati non risulta una Tessera Clubber Led Velvet associata al partecipante.\n\nPer ottenerla e poter accedere ai prossimi eventi è necessario completare la procedura da questo link:\n${MEMBERSHIP_REQUEST_URL}\n\nSenza la tessera non sarà possibile entrare.\nUna volta completata la procedura, verificheremo l’aggiornamento prima dell’evento.\n\nL'attivazione avrà validità un anno dal momento dell'acquisto.\n\nGrazie,\nStaff LEDVELVET`,
  };
}

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
    container: "border-red-500/45 bg-red-500/[0.07]",
    header: "border-red-500/35 bg-red-500/[0.16]",
    badge: "border-red-400/50 bg-red-400/20 text-red-100",
    label: "Non socio",
  },
  identity_review: {
    container: "border-fuchsia-300/35 bg-fuchsia-300/[0.045]",
    header: "border-fuchsia-300/25 bg-fuchsia-300/[0.12]",
    badge: "border-fuchsia-300/40 bg-fuchsia-300/15 text-fuchsia-100",
    label: "Identità dei partecipanti da verificare",
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
  if (row.result === "review") return "identity_review";
  if (!row.member) return "non_member";
  return hasInactiveMembership(row) ? "inactive_member" : "active_member";
}

function anomalyType(row: Row): AnomalyType | null {
  if (row.ticket_status === "cancelled") return null;
  if (row.result === "review") return "identity_review";
  if (row.coverage_status === "possible_duplicate") return "possible_duplicate";
  if (hasInactiveMembership(row)) return "inactive_membership";
  if (!row.member) return "non_member";
  return null;
}

function isClosedAnomaly(anomaly: AnomalyRecord | undefined) {
  return anomaly?.status === "resolved" || anomaly?.status === "archived";
}

function hasSentEmail(anomaly: AnomalyRecord | undefined) {
  return Boolean(
    anomaly?.history.some((item) => item.note?.startsWith("Email inviata a "))
  );
}

function communicationStatusLabel(
  type: AnomalyType,
  anomaly: AnomalyRecord | undefined,
  fallbackStatus: AnomalyStatus
) {
  if (fallbackStatus !== "waiting_participant") {
    return anomalyStatusLabels[fallbackStatus];
  }

  const sent = hasSentEmail(anomaly);
  if (type === "inactive_membership") {
    return sent
      ? "Email rinnovo inviata · In attesa del rinnovo"
      : "Da inviare email di rinnovo";
  }
  if (type === "non_member") {
    return sent
      ? "Email tesseramento inviata · In attesa della domanda"
      : "Da inviare email di tesseramento";
  }
  return sent
    ? "Email inviata · In attesa della risposta"
    : "Da inviare richiesta al partecipante";
}

function prepareEmailLabel(type: AnomalyType, anomaly: AnomalyRecord | undefined) {
  if (hasSentEmail(anomaly)) return "Reinvia email";
  if (type === "inactive_membership") return "Prepara email di rinnovo";
  if (type === "non_member") return "Prepara email di tesseramento";
  if (type === "possible_duplicate") return "Prepara richiesta dati";
  return "Prepara verifica dati";
}

function historyStatusLabel(item: AnomalyHistory) {
  if (item.note?.startsWith("Email inviata a ")) return "Email inviata";
  if (item.note?.startsWith("Invio email fallito")) return "Invio email fallito";
  return anomalyStatusLabels[item.status];
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

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init.headers || {}) },
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
  const [syncingMembers, setSyncingMembers] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [anomalies, setAnomalies] = useState<Record<string, AnomalyRecord>>({});
  const [managementWarning, setManagementWarning] = useState("");
  const [selectedTicketRef, setSelectedTicketRef] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<AnomalyStatus>("open");
  const [draftNote, setDraftNote] = useState("");
  const [draftActionId, setDraftActionId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<MemberCandidate[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchingMember, setSearchingMember] = useState(false);
  const [savingAnomaly, setSavingAnomaly] = useState(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState("");

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

  const resolvedAnomalyRows = useMemo(
    () => rows.filter((row) => isClosedAnomaly(anomalies[row.ticket_ref])),
    [anomalies, rows]
  );

  const categoryRows = useMemo(
    () => filter === "all"
        ? rows
        : filter === "anomalies"
          ? openAnomalyRows
          : filter === "resolved"
            ? resolvedAnomalyRows
          : rows.filter((row) => membershipCategory(row) === filter),
    [filter, openAnomalyRows, resolvedAnomalyRows, rows]
  );

  const workCounts = useMemo(() => {
    const counts: Record<Exclude<WorkFilter, "all">, number> = {
      not_started: 0,
      ready_to_send: 0,
      waiting_reply: 0,
      in_progress: 0,
      resolved: 0,
    };
    for (const row of rows) {
      const detected = anomalyType(row);
      const anomaly = anomalies[row.ticket_ref];
      if (!detected && !anomaly) continue;
      if (isClosedAnomaly(anomaly)) counts.resolved += 1;
      else if (!anomaly) counts.not_started += 1;
      else if (anomaly.status === "in_progress") counts.in_progress += 1;
      else if (hasSentEmail(anomaly)) counts.waiting_reply += 1;
      else counts.ready_to_send += 1;
    }
    return counts;
  }, [anomalies, rows]);

  const visibleRows = useMemo(
    () =>
      workFilter === "all"
        ? categoryRows
        : categoryRows.filter((row) => {
            const detected = anomalyType(row);
            const anomaly = anomalies[row.ticket_ref];
            if (workFilter === "resolved") return isClosedAnomaly(anomaly);
            if (workFilter === "not_started") return Boolean(detected && !anomaly);
            if (workFilter === "in_progress") return anomaly?.status === "in_progress";
            if (workFilter === "waiting_reply") {
              return Boolean(anomaly && !isClosedAnomaly(anomaly) && hasSentEmail(anomaly));
            }
            return Boolean(
              anomaly &&
                !isClosedAnomaly(anomaly) &&
                anomaly.status !== "in_progress" &&
                !hasSentEmail(anomaly)
            );
          }),
    [anomalies, categoryRows, workFilter]
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
    setDraftActionId("");
    setMemberSearch(row.participant.full_name || "");
    setMemberSearchResults(row.name_candidates || []);
    setSelectedMemberId(
      existing?.status === "resolved" || existing?.status === "archived"
        ? existing.member_id || null
        : null
    );
    setEmailDraft(null);
    setEmailResult("");
  }

  async function searchMember() {
    const query = memberSearch.trim();
    if (query.length < 2) return;
    setSearchingMember(true);
    setError("");
    try {
      const payload = await fetchJson(
        `/api/admin/wallyfor/list?q=${encodeURIComponent(query)}&limit=20`
      );
      setMemberSearchResults(
        (payload.rows || []).map((item: Record<string, unknown>) => ({
          id: String(item.id || ""),
          full_name: String(item.full_name || `${item.first_name || ""} ${item.last_name || ""}`).trim(),
          email: item.email ? String(item.email) : null,
          phone: item.phone ? String(item.phone) : null,
          status: item.status ? String(item.status) : null,
          membership_expires_at: item.membership_expires_at ? String(item.membership_expires_at) : null,
        }))
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ricerca socio non riuscita");
    } finally {
      setSearchingMember(false);
    }
  }

  function selectMember(candidate: MemberCandidate) {
    setSelectedMemberId(candidate.id);
    setDraftActionId("match_correct_member");
    setDraftStatus("resolved");
    setDraftNote(
      `Dati ricevuti dall’acquirente e verificati dall’amministratore. Biglietto associato a ${candidate.full_name} (${candidate.email || candidate.phone || "tessera Wallyfor"}).`
    );
  }

  function applyAnomalyAction(type: AnomalyType, actionId: string) {
    setDraftActionId(actionId);
    const action = [...anomalyActionPresets[type], noActionPreset].find(
      (item) => item.id === actionId
    );
    if (!action) return;
    setDraftStatus(action.status);
    setDraftNote(action.note);
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
          member_id:
            detectedType === "identity_review" || detectedType === "possible_duplicate"
              ? selectedMemberId
              : row.member?.id || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Errore HTTP ${response.status}`);
      }
      const saved = payload.anomaly as AnomalyRecord;
      setAnomalies((current) => ({ ...current, [saved.ticket_ref]: saved }));
      setManagementWarning("");
      if (
        (detectedType === "identity_review" || detectedType === "possible_duplicate") &&
        saved.status === "resolved" &&
        saved.member_id
      ) {
        await loadPrescreen(eventId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore nel salvataggio");
    } finally {
      setSavingAnomaly(false);
    }
  }

  function prepareEmail(row: Row) {
    const detectedType = anomalyType(row);
    if (!detectedType) return;
    setEmailResult("");
    setEmailDraft(emailDraftFor(detectedType, row, event));
  }

  async function sendEmail(row: Row) {
    const detectedType = anomalyType(row);
    if (!eventId || !detectedType || !emailDraft) return;
    if (!window.confirm(`Inviare ora questa email a ${emailDraft.recipient}?`)) return;

    setSendingEmail(true);
    setEmailResult("");
    setError("");
    try {
      const response = await fetch("/api/admin/ticket-prescreen/anomalies/email", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          ticket_ref: row.ticket_ref,
          recipient: emailDraft.recipient,
          subject: emailDraft.subject,
          text: emailDraft.text,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Errore HTTP ${response.status}`);
      }
      setEmailResult(`Email inviata correttamente a ${payload.recipient}.`);
      await loadAnomalies(eventId);
    } catch (reason) {
      setEmailResult(
        reason instanceof Error ? `Invio non riuscito: ${reason.message}` : "Invio non riuscito"
      );
    } finally {
      setSendingEmail(false);
    }
  }

  async function loadPrescreen(selectedId = eventId) {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    setFilter("all");
    setWorkFilter("all");
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

  async function syncMembersAndRecheck() {
    if (!eventId) return;
    setSyncingMembers(true);
    setSyncMessage("");
    setError("");
    try {
      const sync = await fetchJson("/api/admin/wallyfor/refresh", { method: "POST" });
      const refreshed = await fetchJson("/api/admin/ticket-prescreen", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      setEvent(refreshed.event || null);
      setSummary(refreshed.summary || null);
      setRows(refreshed.rows || []);
      setGeneratedAt(refreshed.generated_at || null);
      setSelectedTicketRef(null);
      await loadAnomalies(eventId);
      const resolved = Number(refreshed.resolved_count || 0);
      const details = [
        Number(refreshed.new_memberships || 0) > 0
          ? `${Number(refreshed.new_memberships)} nuove tessere rilevate`
          : "",
        Number(refreshed.renewals || 0) > 0
          ? `${Number(refreshed.renewals)} rinnovi rilevati`
          : "",
      ].filter(Boolean).join(" · ");
      setSyncMessage(
        `Sincronizzazione completata: ${Number(sync.fetched || 0).toLocaleString("it-IT")} soci ricevuti. Pre-controllo ricalcolato${resolved ? `: ${resolved} anomalie risolte automaticamente${details ? ` (${details})` : ""}` : "."}`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sincronizzazione non riuscita");
    } finally {
      setSyncingMembers(false);
    }
  }

  const validTickets = Math.max(0, Number(summary?.total || 0) - Number(summary?.cancelled || 0));
  const ticketCards = [
    { label: "Biglietti validi", value: validTickets, color: "text-white", note: "Titoli attivi da controllare" },
    { label: "Coperti", value: summary?.covered_tickets || 0, color: "text-emerald-300", note: "Biglietti associati a una tessera valida" },
    { label: "Non coperti", value: summary?.uncovered_tickets || 0, color: "text-amber-200", note: "Richiedono ancora un socio valido" },
    { label: "Annullati", value: summary?.cancelled || 0, color: "text-white/55", note: "Esclusi dal pre-controllo" },
  ];
  const participantCards = [
    { label: "Tessere attive", value: summary?.active_members || 0, color: "text-emerald-300", note: "Soci distinti con tessera valida" },
    { label: "Da rinnovare", value: summary?.inactive_members || 0, color: "text-amber-200", note: "Soci distinti con tessera non attiva" },
    { label: "Non soci", value: summary?.non_member_participants || 0, color: "text-red-300", note: "Partecipanti senza tessera compatibile" },
    { label: "Identità da verificare", value: summary?.review_participants || 0, color: "text-fuchsia-200", note: "Partecipanti distinti da confermare" },
  ];
  const anomalyCards = [
    { label: "Tessera già utilizzata", value: summary?.possible_duplicates || 0, color: "text-amber-200", note: "Serve il partecipante effettivo" },
    { label: "Anomalie aperte", value: openAnomalyRows.length, color: "text-fuchsia-200", note: "Lavorazioni ancora da completare" },
    { label: "Anomalie risolte", value: resolvedAnomalyRows.length, color: "text-emerald-300", note: "Decisioni già registrate" },
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
          <div className="grid gap-5 lg:grid-cols-[1fr_620px] lg:items-end">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap">
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
                  disabled={!eventId || loading || syncingMembers}
                  onClick={() => void loadPrescreen()}
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Controllo…" : rows.length ? "Aggiorna controllo" : "Controlla"}
                </button>
                <button
                  type="button"
                  disabled={!eventId || loading || syncingMembers}
                  onClick={() => void syncMembersAndRecheck()}
                  className="rounded-2xl border border-fuchsia-300/40 bg-fuchsia-300/10 px-5 py-3 text-sm font-bold text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {syncingMembers ? "Sincronizzazione…" : "Sincronizza soci e ricontrolla"}
                </button>
              </div>
            </div>
          </div>
        </header>

        {syncMessage && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            {syncMessage}
          </div>
        )}

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
              <div className="mt-6 space-y-5">
                {[
                  { title: "Situazione biglietti", cards: ticketCards, columns: "xl:grid-cols-4" },
                  { title: "Situazione partecipanti", cards: participantCards, columns: "xl:grid-cols-4" },
                  { title: "Anomalie operative", cards: anomalyCards, columns: "xl:grid-cols-3" },
                ].map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                      {group.title}
                    </h3>
                    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${group.columns}`}>
                      {group.cards.map((card) => (
                        <div key={card.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                          <div className="text-xs uppercase tracking-[0.14em] text-white/45">{card.label}</div>
                          <div className={`mt-2 text-3xl font-bold ${card.color}`}>
                            {Number(card.value).toLocaleString("it-IT")}
                          </div>
                          <div className="mt-2 text-[11px] leading-4 text-white/40">{card.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] uppercase tracking-[0.12em] text-white/40">
                    Tipo partecipante
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as Filter)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm normal-case tracking-normal text-white"
                    >
                      <option value="all">Tutti gli acquisti</option>
                      <option value="active_member">Acquisti soci attivi</option>
                      <option value="inactive_member">Acquisti soci non attivi</option>
                      <option value="non_member">Acquisti non soci</option>
                      <option value="identity_review">Identità partecipanti da verificare</option>
                      <option value="anomalies">Anomalie da gestire ({openAnomalyRows.length})</option>
                      <option value="resolved">Anomalie risolte ({resolvedAnomalyRows.length})</option>
                    </select>
                  </label>
                  <label className="text-[11px] uppercase tracking-[0.12em] text-white/40">
                    Stato lavorazione
                    <select
                      value={workFilter}
                      onChange={(e) => setWorkFilter(e.target.value as WorkFilter)}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm normal-case tracking-normal text-white"
                    >
                      <option value="all">Tutti gli stati</option>
                      <option value="not_started">Da prendere in carico ({workCounts.not_started})</option>
                      <option value="ready_to_send">Preparati / da contattare ({workCounts.ready_to_send})</option>
                      <option value="waiting_reply">Email inviata / in attesa ({workCounts.waiting_reply})</option>
                      <option value="in_progress">In lavorazione ({workCounts.in_progress})</option>
                      <option value="resolved">Risolti ({workCounts.resolved})</option>
                    </select>
                  </label>
                </div>
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
                            row.ticket_status !== "cancelled" && hasInactiveMembership(row)
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
                          row.ticket_status === "cancelled"
                            ? resultStyles.cancelled
                            : hasInactiveMembership(row)
                            ? resultStyles.inactive
                            : resultStyles[row.result]
                        }`}
                      >
                        {row.ticket_status === "cancelled"
                          ? "Titolo annullato"
                          : hasInactiveMembership(row)
                          ? "Tessera non attiva"
                          : row.result_label}
                      </span>
                      <div
                        className={`mt-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                          row.ticket_status === "cancelled"
                            ? "border-white/10 bg-white/[0.035] text-white/55"
                            : hasInactiveMembership(row)
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
                        {row.ticket_status === "cancelled"
                          ? "Nessuna gestione richiesta"
                          : hasInactiveMembership(row)
                          ? "Socio riconosciuto · Acquisto corretto · Biglietto non coperto"
                          : row.coverage_label}
                      </div>
                      {row.ticket_status === "cancelled" && hasInactiveMembership(row) && (
                        <div className="mt-2 text-xs text-white/45">
                          Socio riconosciuto · Tessera non attiva
                        </div>
                      )}
                      {row.identity_repeated && (
                        <div className="mt-2 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                          Identità ripetuta su {row.identity_ticket_count} biglietti
                        </div>
                      )}
                      {row.matched_by && (
                        <div className="mt-2 text-xs text-white/40">
                          Collegato tramite {row.matched_by === "email+phone"
                            ? "email + telefono"
                            : row.matched_by === "admin_override"
                              ? "conferma amministratore"
                              : row.matched_by}
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
                              ? `${anomalyTypeLabels[anomalyType(row)!]} · ${communicationStatusLabel(anomalyType(row)!, anomalies[row.ticket_ref], anomalies[row.ticket_ref].status)}`
                              : `${anomalyTypeLabels[anomalyType(row)!]} · Non ancora presa in carico`}
                          </div>
                        </div>
                      )}
                      {!anomalyType(row) && isClosedAnomaly(anomalies[row.ticket_ref]) && (
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => openAnomalyManager(row)}
                            className="rounded-xl border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100"
                          >
                            Apri storico risoluzione
                          </button>
                          <div className="text-xs text-emerald-200/70">
                            {anomalies[row.ticket_ref].admin_note || "Anomalia risolta"}
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
                        {(anomalyType(row) === "identity_review" ||
                          anomalyType(row) === "possible_duplicate") && (
                          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
                            <div className="text-sm font-semibold text-cyan-100">
                              Ricerca guidata della Tessera Clubber Led Velvet
                            </div>
                            <div className="mt-1 text-xs leading-5 text-white/50">
                              I risultati sono suggerimenti interni. Nessuna persona viene associata o contattata finché non selezioni una tessera e salvi.
                            </div>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <input
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void searchMember();
                                  }
                                }}
                                placeholder="Nome, email, telefono o codice tessera"
                                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                              />
                              <button
                                type="button"
                                disabled={searchingMember || memberSearch.trim().length < 2}
                                onClick={() => void searchMember()}
                                className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-35"
                              >
                                {searchingMember ? "Ricerca…" : "Cerca in Wallyfor"}
                              </button>
                            </div>
                            {memberSearchResults.length > 0 ? (
                              <div className="mt-3 grid gap-2">
                                {memberSearchResults.map((candidate) => (
                                  <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => selectMember(candidate)}
                                    className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
                                      selectedMemberId === candidate.id
                                        ? "border-emerald-300/60 bg-emerald-300/15 text-emerald-100"
                                        : "border-white/10 bg-black/25 text-white/65 hover:border-cyan-300/35"
                                    }`}
                                  >
                                    <span className="block font-semibold text-white">{candidate.full_name}</span>
                                    <span className="mt-1 block">
                                      {candidate.email || "Email assente"} · {candidate.phone || "Telefono assente"} · {candidate.status || "Stato da verificare"}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 text-xs text-white/40">
                                Nessuna corrispondenza suggerita. Cerca usando i dati ricevuti dall’acquirente.
                              </div>
                            )}
                          </div>
                        )}
                        <label className="mt-4 block text-xs text-white/55">
                          Azione suggerita
                          <select
                            value={draftActionId}
                            onChange={(e) =>
                              applyAnomalyAction(anomalyType(row)!, e.target.value)
                            }
                            className="mt-1 w-full rounded-xl border border-fuchsia-300/25 bg-black/60 px-3 py-2 text-sm text-white"
                          >
                            <option value="">Scegli un’azione precompilata</option>
                            {[...anomalyActionPresets[anomalyType(row)!], noActionPreset]
                              .filter(
                                (action) => action.id !== "match_correct_member" || Boolean(selectedMemberId)
                              )
                              .map(
                              (action) => (
                                <option key={action.id} value={action.id}>
                                  {action.label}
                                </option>
                              )
                            )}
                          </select>
                          <span className="mt-1 block text-[11px] leading-4 text-white/40">
                            Compila stato e nota. Non invia comunicazioni e non salva finché non premi Salva.
                          </span>
                        </label>
                        <div className="mt-3 grid gap-3 md:grid-cols-[260px_1fr_auto] md:items-end">
                          <label className="text-xs text-white/55">
                            Stato
                            <select
                              value={draftStatus}
                              onChange={(e) => setDraftStatus(e.target.value as AnomalyStatus)}
                              className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                            >
                              {Object.entries(anomalyStatusLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {value === "waiting_participant"
                                    ? communicationStatusLabel(
                                        anomalyType(row)!,
                                        anomalies[row.ticket_ref],
                                        "waiting_participant"
                                      )
                                    : label}
                                </option>
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
                        <div className="mt-4 border-t border-white/10 pt-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={
                                !anomalies[row.ticket_ref] ||
                                !(row.buyer?.email || row.participant.email)
                              }
                              onClick={() => prepareEmail(row)}
                              className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              {prepareEmailLabel(
                                anomalyType(row)!,
                                anomalies[row.ticket_ref]
                              )}
                            </button>
                            {(anomalyType(row) === "identity_review" ||
                              anomalyType(row) === "possible_duplicate") && (
                              <button
                                type="button"
                                disabled={
                                  !anomalies[row.ticket_ref] ||
                                  !(row.buyer?.email || row.participant.email)
                                }
                                onClick={() => {
                                  setEmailResult("");
                                  setEmailDraft(participantMembershipDraftFor(row, event));
                                }}
                                className="rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
                              >
                                Prepara tesseramento del partecipante
                              </button>
                            )}
                            <span className="text-xs text-white/45">
                              {!anomalies[row.ticket_ref]
                                ? "Salva prima la gestione dell’anomalia."
                                : !(row.buyer?.email || row.participant.email)
                                  ? "Il biglietto non contiene un’email destinatario."
                                  : hasSentEmail(anomalies[row.ticket_ref])
                                    ? "Email già inviata: puoi controllarla e reinviarla."
                                    : "L’invio avviene solo dopo anteprima e conferma."}
                            </span>
                          </div>

                          {emailDraft && (
                            <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-black/25 p-4">
                              <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">
                                Anteprima comunicazione
                              </div>
                              <div className="mt-3 grid gap-3">
                                <label className="text-xs text-white/55">
                                  Destinatario
                                  <input
                                    type="email"
                                    value={emailDraft.recipient}
                                    onChange={(e) =>
                                      setEmailDraft((current) =>
                                        current ? { ...current, recipient: e.target.value } : current
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                                  />
                                </label>
                                <label className="text-xs text-white/55">
                                  Oggetto
                                  <input
                                    value={emailDraft.subject}
                                    maxLength={180}
                                    onChange={(e) =>
                                      setEmailDraft((current) =>
                                        current ? { ...current, subject: e.target.value } : current
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                                  />
                                </label>
                                <label className="text-xs text-white/55">
                                  Testo email
                                  <textarea
                                    value={emailDraft.text}
                                    maxLength={8000}
                                    onChange={(e) =>
                                      setEmailDraft((current) =>
                                        current ? { ...current, text: e.target.value } : current
                                      )
                                    }
                                    className="mt-1 min-h-64 w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm leading-6 text-white"
                                  />
                                </label>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  disabled={
                                    sendingEmail ||
                                    !emailDraft.recipient.trim() ||
                                    !emailDraft.subject.trim() ||
                                    !emailDraft.text.trim()
                                  }
                                  onClick={() => void sendEmail(row)}
                                  className="rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40"
                                >
                                  {sendingEmail
                                    ? "Invio…"
                                    : hasSentEmail(anomalies[row.ticket_ref])
                                      ? "Reinvia email"
                                      : "Invia email"}
                                </button>
                                <button
                                  type="button"
                                  disabled={sendingEmail}
                                  onClick={() => {
                                    setEmailDraft(null);
                                    setEmailResult("");
                                  }}
                                  className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/65 disabled:opacity-40"
                                >
                                  Annulla
                                </button>
                                <span className="text-xs text-white/45">
                                  Mittente configurato: {" "}
                                  <span className="font-semibold text-white/70">admin@ledvelvet.it</span>
                                </span>
                              </div>
                            </div>
                          )}

                          {emailResult && (
                            <div
                              className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                                emailResult.startsWith("Email inviata")
                                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                                  : "border-red-400/30 bg-red-400/10 text-red-200"
                              }`}
                            >
                              {emailResult}
                            </div>
                          )}
                        </div>
                        {(anomalies[row.ticket_ref]?.history || []).length > 0 && (
                          <div className="mt-4 border-t border-white/10 pt-3">
                            <div className="text-xs uppercase tracking-[0.14em] text-white/40">Storico decisioni</div>
                            <div className="mt-2 space-y-2">
                              {anomalies[row.ticket_ref].history.map((item) => (
                                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                                  <span className="font-semibold text-white/80">{historyStatusLabel(item)}</span>
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

                    {selectedTicketRef === row.ticket_ref &&
                      !anomalyType(row) &&
                      isClosedAnomaly(anomalies[row.ticket_ref]) && (
                        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.07] p-4 lg:col-span-4">
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-emerald-100">
                                {anomalyTypeLabels[anomalies[row.ticket_ref].anomaly_type]} · {anomalyStatusLabels[anomalies[row.ticket_ref].status]}
                              </div>
                              <div className="mt-1 text-xs text-white/55">
                                {anomalies[row.ticket_ref].admin_note || "Anomalia risolta."}
                              </div>
                            </div>
                            <button type="button" onClick={() => setSelectedTicketRef(null)} className="text-left text-xs text-white/50 md:text-right">
                              Chiudi storico
                            </button>
                          </div>
                          <div className="mt-4 space-y-2">
                            {(anomalies[row.ticket_ref].history || []).map((item) => (
                              <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                                <span className="font-semibold text-white/80">{historyStatusLabel(item)}</span>
                                {" · "}{formatDate(item.created_at, true)}
                                {" · "}{item.admin_email}
                                {item.note ? ` · ${item.note}` : ""}
                              </div>
                            ))}
                          </div>
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
