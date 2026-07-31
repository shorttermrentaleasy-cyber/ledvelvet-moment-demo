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
  | "duplicate"
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
  matched_by: "email+phone" | "email" | "phone" | null;
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
    duplicate: "Socio su più biglietti",
    cancelled: "Biglietto annullato",
  };
  return labels[result];
}

export function buildPrescreenRows(params: {
  tickets: PrescreenTicket[];
  bookings: PrescreenBooking[];
  members: PrescreenMember[];
  today?: string;
}) {
  const today = params.today || new Date().toISOString().slice(0, 10);
  const emailIndex = new Map<string, PrescreenMember[]>();
  const phoneIndex = new Map<string, PrescreenMember[]>();
  const nameIndex = new Map<string, PrescreenMember[]>();

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
      ticket_ref: shortTicketRef(qr),
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
  for (const row of rows) {
    if (row.member_id && row.ticket_status !== "cancelled") {
      activeMemberTicketCount.set(
        row.member_id,
        (activeMemberTicketCount.get(row.member_id) || 0) + 1
      );
    }
  }

  return rows.map(({ qr: _qr, member_id, ...row }) => {
    if (
      member_id &&
      row.ticket_status !== "cancelled" &&
      (activeMemberTicketCount.get(member_id) || 0) > 1
    ) {
      return {
        ...row,
        result: "duplicate" as const,
        result_label: resultLabel("duplicate"),
        warnings: [...row.warnings, "Stesso socio associato a più QR dell’evento"],
      };
    }
    return row;
  });
}

export function summarizePrescreen(rows: PrescreenRow[]) {
  const summary = {
    total: rows.length,
    active: 0,
    inactive: 0,
    not_found: 0,
    review: 0,
    duplicate: 0,
    cancelled: 0,
  };
  for (const row of rows) summary[row.result] += 1;
  return summary;
}
