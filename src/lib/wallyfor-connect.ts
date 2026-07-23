const DEFAULT_WALLYFOR_CONNECT_URL =
  "https://wallyfor.com/connect/v1/members";

export type PendingWallyforMember = {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  prefisso: string;
  data_nascita: string;
  sesso?: string;
  codice_fiscale?: string;
  privacy: boolean;
  termini: boolean;
  promozionale?: boolean;
  foto?: boolean;
  maggiorenne: boolean;
};

export class WallyforConnectError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "WallyforConnectError";
    this.status = status;
    this.code = code;
  }
}

function requiredEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new WallyforConnectError(
      `Missing env: ${name}`,
      500,
      "MISSING_ENV"
    );
  }
  return value;
}

export async function createPendingWallyforMember(
  member: PendingWallyforMember
) {
  const url = String(
    process.env.WALLYFOR_CONNECT_URL || DEFAULT_WALLYFOR_CONNECT_URL
  ).trim();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("WALLYFOR_WRITE_API_KEY")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(member),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    throw new WallyforConnectError(message, 503, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const remoteMessage =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : `Wallyfor request failed (${response.status})`;
    throw new WallyforConnectError(
      remoteMessage,
      response.status,
      "WALLYFOR_REJECTED"
    );
  }

  return payload;
}
