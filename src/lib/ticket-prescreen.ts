export type PrescreenMember = {
  id: string;
  barcode: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  membership_group: string | null;
  status: string | null;
  membership_expires_at: string | null;
  is_present: boolean | null;
};

export type PrescreenTicket = {
  qrCode: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  hasCheckedIn?: boolean | null;
  checkedInTime?: number | null;
  isActive?: boolean | null;
  offer?: { name?: string | null } | null;
};

export type PrescreenBooking = {
  id?: string | null;
  legacyId?: number | string | null;
  purchasedAt?: number | null;
  buyer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  passes?: PrescreenTicket[] | null;
  offer?: { name?: string | null } | null;
};

export type PrescreenResult =
  | "active"
  | "inactive"
  | "not_found"
  | "review"
  | "cancelled";

export type PrescreenRow = {
  ticket_ref: string;
  order_ref: string | null;
  purchased_at: string | null;
  ticket_status: "active" | "checked_in" | "cancelled";
  offer_name: string | null;
  participant: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
  buyer: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  result: PrescreenResult;
  result_label: string;
  identity_repeated: boolean;
  identity_ticket_count: number | null;
  coverage_status: "covered" | "uncovered" | "unidentified" | "possible_duplicate";
  coverage_label: string;
  first_purchase: boolean;
  matched_by: "email+phone" | "email" | "phone" | "admin_override" | null;
  warnings: string[];
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

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("39") && digits.length > 10 ? digits.slice(2) : digits;
}

function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || null;
}

function memberName(member: PrescreenMember) {
  return member.full_name || fullName(member.first_name, member.last_name);
}

function toIsoFromEpoch(value?: number | null) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return null;
  const date = new Date(number < 10_000_000_000 ? number * 1000 : number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shortTicketRef(qrCode: string) {
  const clean = String(qrCode || "").trim();
  if (!clean) return "—";
  return clean.length <= 8 ? clean : `…${clean.slice(-8)}`;
}

function uniqueMembers(members: PrescreenMember[]) {
  return Array.from(new Map(members.map((member) => [member.id, member])).values());
}

function intersection(left: PrescreenMember[], right: PrescreenMember[]) {
  const rightIds = new Set(right.map((member) => member.id));
  return left.filter((member) => rightIds.has(member.id));
}

function membershipResult(member: PrescreenMember, today: string): PrescreenResult {
  const status = String(member.status || "").trim().toUpperCase();
  const expired = Boolean(
    member.membership_expires_at && member.membership_expires_at < today
  );

  if (
    member.is_present === false ||
    status === "NON ATTIVA" ||
    status === "REVOCATA" ||
    status === "SCADUTA" ||
    expired
  ) {
    return "inactive";
  }

  return status === "ATTIVA" && Boolean(member.membership_expires_at)
    ? "active"
    : "review";
}

function resultLabel(result: PrescreenResult) {
  const labels: Record<PrescreenResult, string> = {
    active: "Socio attivo",
    inactive: "Tessera non attiva",
    not_found: "Socio non trovato",
    review: "Da verificare",
    cancelled: "Biglietto annullato",
  };
  return labels[result];
}

export function buildPrescreenRows(params: {
  tickets: PrescreenTicket[];
  bookings: PrescreenBooking[];
  members: PrescreenMember[];
  memberOverrides?: Map<string, string>;
  today?: string;
}) {
  const today = params.today || new Date().toISOString().slice(0, 10);
  const emailIndex = new Map<string, PrescreenMember[]>();
  const phoneIndex = new Map<string, PrescreenMember[]>();
  const nameIndex = new Map<string, PrescreenMember[]>();
  const memberById = new Map(params.members.map((member) => [member.id, member]));

  const add = (
    index: Map<string, PrescreenMember[]>,
    key: string,
    member: PrescreenMember
  ) => {
    if (!key) return;
    index.set(key, [...(index.get(key) || []), member]);
  };

  for (const member of params.members) {
    add(emailIndex, normalizeEmail(member.email), member);
    add(phoneIndex, normalizePhone(member.phone), member);
    add(nameIndex, normalizeName(memberName(member)), member);
  }

  const bookingByQr = new Map<
    string,
    { booking: PrescreenBooking; pass: PrescreenTicket }
  >();
  for (const booking of params.bookings) {
    for (const pass of booking.passes || []) {
      const qr = String(pass.qrCode || "").trim();
      if (qr) bookingByQr.set(qr, { booking, pass });
    }
  }

  const rows: Array<PrescreenRow & { member_id: string | null; qr: string }> = [];

  for (const ticket of params.tickets) {
    const qr = String(ticket.qrCode || "").trim();
    if (!qr) continue;
    const ticketRef = shortTicketRef(qr);

    const bookingMatch = bookingByQr.get(qr);
    const pass = bookingMatch?.pass;
    const booking = bookingMatch?.booking;
    const firstName = ticket.firstName || pass?.firstName || null;
    const lastName = ticket.lastName || pass?.lastName || null;
    const participantName = fullName(firstName, lastName);
    const email = normalizeEmail(ticket.email || pass?.email) || null;
    const phone = String(ticket.phone || pass?.phone || "").trim() || null;
    const emailMatches = uniqueMembers(email ? emailIndex.get(email) || [] : []);
    const phoneNormalized = normalizePhone(phone);
    const phoneMatches = uniqueMembers(
      phoneNormalized ? phoneIndex.get(phoneNormalized) || [] : []
    );
    const both = intersection(emailMatches, phoneMatches);
    const warnings: string[] = [];
    let matched: PrescreenMember | null = null;
    let matchedBy: PrescreenRow["matched_by"] = null;
    let identityCertain = false;
    let identityAmbiguous = false;

    if (emailMatches.length && phoneMatches.length) {
      if (both.length === 1) {
        matched = both[0];
        matchedBy = "email+phone";
        identityCertain = emailMatches.length === 1 && phoneMatches.length === 1;
        if (!identityCertain) warnings.push("Email o telefono condiviso con altri soci");
      } else if (both.length > 1) {
        identityAmbiguous = true;
        warnings.push("Più soci coincidono con email e telefono");
      } else {
        identityAmbiguous = true;
        warnings.push("Email e telefono appartengono a soci diversi");
      }
    } else if (emailMatches.length === 1) {
      matched = emailMatches[0];
      matchedBy = "email";
      warnings.push("Corrispondenza trovata solo tramite email");
    } else if (phoneMatches.length === 1) {
      matched = phoneMatches[0];
      matchedBy = "phone";
      warnings.push("Corrispondenza trovata solo tramite telefono");
    } else if (emailMatches.length > 1 || phoneMatches.length > 1) {
      identityAmbiguous = true;
      warnings.push("Contatto associato a più soci");
    }

    if (!matched && participantName && nameIndex.has(normalizeName(participantName))) {
      warnings.push("Nome presente in Wallyfor, ma contatti non coincidenti");
    }

    if (
      matched &&
      participantName &&
      normalizeName(participantName) !== normalizeName(memberName(matched))
    ) {
      identityCertain = false;
      warnings.push("Nominativo Xceed diverso dall’anagrafica Wallyfor");
    }

    const overriddenMemberId = params.memberOverrides?.get(ticketRef);
    const overriddenMember = overriddenMemberId
      ? memberById.get(overriddenMemberId) || null
      : null;
    if (overriddenMember) {
      matched = overriddenMember;
      matchedBy = "admin_override";
      identityCertain = true;
      identityAmbiguous = false;
      warnings.push("Identità confermata dall’amministratore");
    }

    const cancelled = ticket.isActive === false || pass?.isActive === false;
    let result: PrescreenResult;
    if (cancelled) result = "cancelled";
    else if (!matched) result = identityAmbiguous ? "review" : "not_found";
    else if (!identityCertain) result = "review";
    else result = membershipResult(matched, today);

    const buyerName = fullName(
      booking?.buyer?.firstName,
      booking?.buyer?.lastName
    );

    rows.push({
      qr,
      member_id: matched?.id || null,
      ticket_ref: ticketRef,
      order_ref:
        booking?.legacyId != null
          ? String(booking.legacyId)
          : booking?.id
            ? String(booking.id)
            : null,
      purchased_at: toIsoFromEpoch(booking?.purchasedAt),
      ticket_status: cancelled
        ? "cancelled"
        : ticket.hasCheckedIn || pass?.hasCheckedIn || ticket.checkedInTime || pass?.checkedInTime
          ? "checked_in"
          : "active",
      offer_name: ticket.offer?.name || booking?.offer?.name || null,
      participant: { full_name: participantName, email, phone },
      buyer: booking?.buyer
        ? {
            full_name: buyerName,
            email: normalizeEmail(booking.buyer.email) || null,
            phone: String(booking.buyer.phone || "").trim() || null,
          }
        : null,
      result,
      result_label: resultLabel(result),
      identity_repeated: false,
      identity_ticket_count: null,
      coverage_status: "uncovered",
      coverage_label: "Partecipante da associare",
      first_purchase: false,
      matched_by: matchedBy,
      warnings,
      member: matched
        ? {
            id: matched.id,
            barcode: matched.barcode,
            full_name: memberName(matched),
            email: matched.email,
            phone: matched.phone,
            membership_group: matched.membership_group,
            status: matched.status,
            membership_expires_at: matched.membership_expires_at,
          }
        : null,
    });
  }

  const activeMemberTicketCount = new Map<string, number>();
  const activeRowsByMember = new Map<
    string,
    Array<(typeof rows)[number]>
  >();
  for (const row of rows) {
    if (row.member_id && row.ticket_status !== "cancelled") {
      activeMemberTicketCount.set(
        row.member_id,
        (activeMemberTicketCount.get(row.member_id) || 0) + 1
      );
      if (row.result === "active") {
        activeRowsByMember.set(row.member_id, [
          ...(activeRowsByMember.get(row.member_id) || []),
          row,
        ]);
      }
    }
  }

  const coverageByQr = new Map<
    string,
    Pick<PrescreenRow, "coverage_status" | "coverage_label" | "first_purchase">
  >();

  for (const memberRows of activeRowsByMember.values()) {
    const groups = new Map<string, typeof memberRows>();
    for (const row of memberRows) {
      const key = row.order_ref ? `order:${row.order_ref}` : `ticket:${row.qr}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }

    const orderedGroups = Array.from(groups.values())
      .map((groupRows) => ({
        rows: groupRows,
        purchasedAt: groupRows.reduce<number | null>((earliest, row) => {
          const time = row.purchased_at ? Date.parse(row.purchased_at) : Number.NaN;
          if (!Number.isFinite(time)) return earliest;
          return earliest == null || time < earliest ? time : earliest;
        }, null),
      }))
      .sort((left, right) => {
        if (left.purchasedAt == null) return right.purchasedAt == null ? 0 : 1;
        if (right.purchasedAt == null) return -1;
        return left.purchasedAt - right.purchasedAt;
      });

    const firstGroup = orderedGroups[0];
    const secondGroup = orderedGroups[1];
    const firstPurchaseIsCertain = Boolean(
      firstGroup &&
        (orderedGroups.length === 1 ||
          (firstGroup.purchasedAt != null &&
            orderedGroups.every((group) => group.purchasedAt != null) &&
            firstGroup.purchasedAt !== secondGroup?.purchasedAt))
    );

    if (!firstPurchaseIsCertain || !firstGroup) {
      for (const row of memberRows) {
        coverageByQr.set(row.qr, {
          coverage_status: "unidentified",
          coverage_label: "Copertura presente, primo acquisto non determinabile",
          first_purchase: false,
        });
      }
      continue;
    }

    for (const row of firstGroup.rows) {
      coverageByQr.set(row.qr, {
        coverage_status: firstGroup.rows.length === 1 ? "covered" : "unidentified",
        coverage_label:
          firstGroup.rows.length === 1
            ? "Coperto da tessera attiva – primo acquisto"
            : "1 copertura nel primo acquisto; QR personale non identificabile",
        first_purchase: true,
      });
    }

    for (const group of orderedGroups.slice(1)) {
      for (const row of group.rows) {
        coverageByQr.set(row.qr, {
          coverage_status: "possible_duplicate",
          coverage_label: "Possibile doppione – tessera già usata nel primo acquisto",
          first_purchase: false,
        });
      }
    }
  }

  return rows.map(({ qr, member_id, ...row }) => {
    const identityTicketCount = member_id
      ? activeMemberTicketCount.get(member_id) || 0
      : 0;
    const coverage =
      row.ticket_status === "cancelled" || row.result !== "active"
        ? {
            coverage_status: "uncovered" as const,
            coverage_label:
              row.ticket_status === "cancelled"
                ? "Biglietto annullato"
                : row.result === "inactive"
                  ? "Socio riconosciuto – tessera non attiva"
                  : row.result === "review" && member_id
                    ? "Socio riconosciuto – stato tessera da verificare"
                    : row.result === "review"
                      ? "Partecipante da verificare"
                      : "Partecipante da associare",
            first_purchase: false,
          }
        : coverageByQr.get(qr) || {
            coverage_status: "unidentified" as const,
            coverage_label: "Copertura presente, attribuzione non determinabile",
            first_purchase: false,
          };

    if (
      member_id &&
      row.ticket_status !== "cancelled" &&
      identityTicketCount > 1
    ) {
      return {
        ...row,
        ...coverage,
        identity_repeated: true,
        identity_ticket_count: identityTicketCount,
        warnings: [
          ...row.warnings,
          `Stesso socio associato a ${identityTicketCount} QR dell’evento`,
        ],
      };
    }
    return { ...row, ...coverage };
  });
}

export function summarizePrescreen(rows: PrescreenRow[]) {
  const summary = {
    total: rows.length,
    active: 0,
    inactive: 0,
    not_found: 0,
    review: 0,
    repeated_identity: 0,
    cancelled: 0,
    active_members: 0,
    covered_tickets: 0,
    uncovered_tickets: 0,
    possible_duplicates: 0,
  };
  const activeMembers = new Set<string>();
  for (const row of rows) {
    summary[row.result] += 1;
    if (row.identity_repeated) summary.repeated_identity += 1;
    if (row.coverage_status === "possible_duplicate") {
      summary.possible_duplicates += 1;
    }
    if (row.result === "active" && row.member?.id) activeMembers.add(row.member.id);
  }
  summary.active_members = activeMembers.size;
  summary.covered_tickets = activeMembers.size;
  summary.uncovered_tickets = Math.max(
    0,
    rows.filter((row) => row.ticket_status !== "cancelled").length - activeMembers.size
  );
  return summary;
}
