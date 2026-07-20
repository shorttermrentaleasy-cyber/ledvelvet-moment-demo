const DEFAULT_WALLYFOR_BASE_URL = "https://wallyfor.com/auto/api/1_0";

type WallyforGroup = {
  id?: number | string | null;
  nome?: string | null;
};

type WallyforPass = {
  barcode?: string | null;
  nome?: string | null;
  cognome?: string | null;
  email?: string | null;
  telefono?: string | null;
  stato?: string | null;
  scadenza?: string | null;
  data_prima_iscrizione?: string | null;
  gruppo?: WallyforGroup | null;
};

type WallyforListResponse = {
  status?: string;
  data?: WallyforPass[];
  error?: string;
  code?: string;
};

export type WallyforMember = {
  id: string;
  barcode: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  membership_group: string | null;
  membership_expires_at: string | null;
  raw: WallyforPass;
};

export type WallyforSnapshot = {
  members: WallyforMember[];
  pages: number;
};

export class WallyforApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = "WallyforApiError";
    this.status = status;
    this.code = code || null;
  }
}

function requiredEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new WallyforApiError(`Missing env: ${name}`, 500, "MISSING_ENV");
  return value;
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function nullableText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeStatus(value: unknown): string | null {
  const status = String(value || "").trim().toUpperCase();
  if (!status) return null;
  if (status === "ND") return "NON ATTIVA";
  return status;
}

function normalizeExpiryDate(value: unknown): string | null {
  const date = String(value || "").trim();
  if (!date) return null;

  const italian = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
  if (italian) return `${italian[3]}-${italian[2]}-${italian[1]}`;

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function mapPass(pass: WallyforPass): WallyforMember | null {
  const barcode = String(pass?.barcode || "").trim();
  if (!barcode) return null;

  return {
    id: `wallyfor:${barcode}`,
    barcode,
    first_name: nullableText(pass.nome),
    last_name: nullableText(pass.cognome),
    email: nullableText(pass.email),
    phone: nullableText(pass.telefono),
    status: normalizeStatus(pass.stato),
    membership_group: nullableText(pass.gruppo?.nome),
    membership_expires_at: normalizeExpiryDate(pass.scadenza),
    raw: pass,
  };
}

async function fetchPassesPage(params: {
  email?: string;
  page?: number;
  perPage: number;
  timeoutMs?: number;
}): Promise<WallyforPass[]> {
  const baseUrl = String(
    process.env.WALLYFOR_BASE_URL || DEFAULT_WALLYFOR_BASE_URL
  ).replace(/\/$/, "");
  const url = new URL(`${baseUrl}/passes.php`);
  url.searchParams.set("ID", requiredEnv("WALLYFOR_ASSOCIATION_ID"));
  url.searchParams.set("perPage", String(params.perPage));
  if (params.email) url.searchParams.set("email", params.email);
  if (params.page) url.searchParams.set("page", String(params.page));

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${requiredEnv("WALLYFOR_API_KEY")}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs ?? 15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    throw new WallyforApiError(message, 503, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as
    | WallyforListResponse
    | null;

  if (!response.ok || payload?.status !== "OK" || !Array.isArray(payload.data)) {
    throw new WallyforApiError(
      payload?.error || `Wallyfor request failed (${response.status})`,
      response.status,
      payload?.code
    );
  }

  return payload.data;
}

export async function fetchAllWallyforMembers(): Promise<WallyforSnapshot> {
  const perPage = 500;
  const maxPages = 100;
  const members = new Map<string, WallyforMember>();
  let previousSignature: string | null = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const passes = await fetchPassesPage({ page, perPage });
    const signature = passes
      .slice(0, 5)
      .map((pass) => String(pass?.barcode || ""))
      .join("|");

    if (page > 1 && passes.length > 0 && signature === previousSignature) {
      throw new WallyforApiError(
        "Wallyfor pagination repeated the same page; snapshot aborted",
        502,
        "PAGINATION_REPEATED"
      );
    }
    previousSignature = signature;

    for (const pass of passes) {
      const member = mapPass(pass);
      if (member) members.set(member.barcode, member);
    }

    if (passes.length < perPage) {
      return { members: Array.from(members.values()), pages: page };
    }
  }

  throw new WallyforApiError(
    "Wallyfor snapshot exceeded the pagination safety limit",
    502,
    "PAGINATION_LIMIT"
  );
}

export async function findWallyforMembersByEmail(
  email: string
): Promise<WallyforMember[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const passes = await fetchPassesPage({
    email: normalizedEmail,
    perPage: 500,
    timeoutMs: 4000,
  });

  return passes
    .filter((pass) => normalizeEmail(pass.email) === normalizedEmail)
    .map(mapPass)
    .filter((member): member is WallyforMember => Boolean(member));
}
