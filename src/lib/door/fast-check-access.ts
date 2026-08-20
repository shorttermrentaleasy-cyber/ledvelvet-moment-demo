import { createHmac, timingSafeEqual } from "crypto";

export type FastCheckDoorRole = "ordinary" | "loyalty" | "privileged";

export type FastCheckAccess = {
  version: 1;
  event_id: string;
  gate_id: string;
  gate_role: FastCheckDoorRole;
  expires_at: number;
};

const TOKEN_HEADER = "x-fast-check-token";

function accessSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("Missing env: NEXTAUTH_SECRET");
  }

  return secret;
}

function normalize(value: unknown): string {
  return String(value || "").trim();
}

function isDoorRole(value: unknown): value is FastCheckDoorRole {
  return (
    value === "ordinary" || value === "loyalty" || value === "privileged"
  );
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", accessSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createFastCheckAccessToken(input: {
  eventId: string;
  gateId: string;
  gateRole: FastCheckDoorRole;
  expiresAt: number;
}): string {
  const eventId = normalize(input.eventId);
  const gateId = normalize(input.gateId);
  const expiresAt = Math.floor(input.expiresAt);

  if (!eventId || !gateId || !isDoorRole(input.gateRole)) {
    throw new Error("Invalid Fast Check access scope");
  }

  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new Error("Invalid Fast Check access expiration");
  }

  const payload: FastCheckAccess = {
    version: 1,
    event_id: eventId,
    gate_id: gateId,
    gate_role: input.gateRole,
    expires_at: expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyFastCheckAccessToken(
  token: string | null | undefined
): FastCheckAccess | null {
  const normalizedToken = normalize(token);
  const parts = normalizedToken.split(".");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const [encodedPayload, receivedSignature] = parts;
  const expectedSignature = sign(encodedPayload);
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<FastCheckAccess>;

    if (
      payload.version !== 1 ||
      !normalize(payload.event_id) ||
      !normalize(payload.gate_id) ||
      !isDoorRole(payload.gate_role) ||
      !Number.isSafeInteger(payload.expires_at) ||
      Number(payload.expires_at) <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      version: 1,
      event_id: normalize(payload.event_id),
      gate_id: normalize(payload.gate_id),
      gate_role: payload.gate_role,
      expires_at: Number(payload.expires_at),
    };
  } catch {
    return null;
  }
}

export function readFastCheckAccessToken(request: Request): string {
  return normalize(request.headers.get(TOKEN_HEADER));
}

export function fastCheckAccessHeader(token: string): Record<string, string> {
  return { "X-Fast-Check-Token": token };
}
