export type NormalizedOfferType =
  | "ticket"
  | "guest-list"
  | "table"
  | "staff"
  | "unknown"
  | string;

type XceedRawLike = {
  offer?: {
    type?: string | null;
    name?: string | null;
  } | null;
} | null;

type TicketRowLike = {
  raw?: unknown;
  offer_type?: string | null;
  offer_name?: string | null;
};

export function safeJsonParse<T = unknown>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function normalizeOfferType(input?: string | null): NormalizedOfferType {
  const v = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (!v) return "unknown";

  if (v === "guestlist" || v === "guest-list") return "guest-list";
  if (v === "ticket") return "ticket";
  if (v === "table" || v === "vip-table") return "table";
  if (v === "staff") return "staff";

  return v;
}

export function getOfferTypeFromTicketRow(row: TicketRowLike): {
  normalizedType: NormalizedOfferType;
  rawOfferType: string | null;
  offerName: string | null;
  source: "raw.offer.type" | "offer_type" | "fallback";
} {
  const raw = safeJsonParse<XceedRawLike>(row.raw);

  const rawOfferType =
    raw?.offer?.type?.toString().trim() ||
    row.offer_type?.toString().trim() ||
    null;

  const offerName =
    raw?.offer?.name?.toString().trim() ||
    row.offer_name?.toString().trim() ||
    null;

  if (raw?.offer?.type) {
    return {
      normalizedType: normalizeOfferType(raw.offer.type),
      rawOfferType,
      offerName,
      source: "raw.offer.type",
    };
  }

  if (row.offer_type) {
    return {
      normalizedType: normalizeOfferType(row.offer_type),
      rawOfferType,
      offerName,
      source: "offer_type",
    };
  }

  return {
    normalizedType: "ticket",
    rawOfferType: null,
    offerName,
    source: "fallback",
  };
}

export function getOfferTypeLabel(type: string | null | undefined): string {
  const t = normalizeOfferType(type);

  switch (t) {
    case "guest-list":
      return "Guest List";
    case "ticket":
      return "Ticket";
    case "table":
      return "Table";
    case "staff":
      return "Staff";
    case "unknown":
      return "Non definito";
    default:
      return t;
  }
}

export function getOfferTypeUi(type: string | null | undefined): {
  label: string;
  className: string;
} {
  const t = normalizeOfferType(type);

  switch (t) {
    case "guest-list":
      return {
        label: "GUEST LIST",
        className:
          "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200",
      };

    case "staff":
      return {
        label: "STAFF",
        className:
          "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
      };

    case "table":
      return {
        label: "TABLE",
        className:
          "border-amber-500/40 bg-amber-500/15 text-amber-200",
      };

    case "ticket":
      return {
        label: "TICKET",
        className:
          "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
      };

    default:
      return {
        label: getOfferTypeLabel(t).toUpperCase(),
        className:
          "border-white/20 bg-white/10 text-white",
      };
  }
}