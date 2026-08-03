type MemberTicketData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  barcode: string;
};

export function normalizeMemberBarcode(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
}

export function isValidMemberTicketBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isXceed = host === "xceed.me" || host.endsWith(".xceed.me");
    return url.protocol === "https:" && isXceed && url.pathname.includes("/checkout/promocode/");
  } catch {
    return false;
  }
}

function getXceedEventUrlParts(url: URL) {
  const host = url.hostname.toLowerCase();
  const isXceed = host === "xceed.me" || host.endsWith(".xceed.me");
  if (url.protocol !== "https:" || !isXceed) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const eventIndex = parts.findIndex((part) => part.toLowerCase() === "event");
  const slug = eventIndex >= 0 ? parts[eventIndex + 1] : "";
  const legacyId = eventIndex >= 0 ? parts[eventIndex + 2] : "";
  if (!slug || !/^\d+$/.test(legacyId)) return null;

  const channelIndex = parts.findIndex((part) => part.toLowerCase() === "channel");
  const channel =
    (channelIndex >= 0 ? parts[channelIndex + 1] : "") || url.searchParams.get("channel") || "";

  return {
    prefix: parts.slice(0, eventIndex),
    slug,
    channel,
  };
}

export function isValidXceedEventUrl(value: string) {
  try {
    return Boolean(getXceedEventUrlParts(new URL(value)));
  } catch {
    return false;
  }
}

export function buildMemberTicketBaseUrl(
  eventUrl: string,
  eventUuid: string,
  promoCode: string
) {
  const code = promoCode.trim();
  const uuid = eventUuid.trim();
  if (!code || !/^[0-9a-f-]{36}$/i.test(uuid)) return null;

  let url: URL;
  try {
    url = new URL(eventUrl);
  } catch {
    return null;
  }

  const event = getXceedEventUrlParts(url);
  if (!event) return null;

  const parts = [
    ...event.prefix,
    "checkout",
    "promocode",
    event.slug,
    uuid,
    "promocode",
    code,
  ];
  url.pathname = `/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
  url.search = "";
  if (event.channel) url.searchParams.set("channel", event.channel);

  return isValidMemberTicketBaseUrl(url.toString()) ? url.toString() : null;
}

export function getMemberTicketPromoCode(baseUrl: string) {
  if (!isValidMemberTicketBaseUrl(baseUrl)) return "";

  const parts = new URL(baseUrl).pathname.split("/").filter(Boolean);
  let promoIndex = -1;
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].toLowerCase() === "promocode") promoIndex = index;
  }
  if (promoIndex < 0 || !parts[promoIndex + 1]) return "";

  try {
    return decodeURIComponent(parts[promoIndex + 1]);
  } catch {
    return parts[promoIndex + 1];
  }
}

export function normalizeMemberPhoneForXceed(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("39") && digits.length > 10) return `+${digits}`;

  return `+39${digits}`;
}

export function buildMemberTicketUrl(baseUrl: string, member: MemberTicketData) {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }

  if (!isValidMemberTicketBaseUrl(baseUrl)) return null;

  url.searchParams.set("firstName", member.firstName.trim());
  url.searchParams.set("lastName", member.lastName.trim());
  url.searchParams.set("email", member.email.trim());
  url.searchParams.set("emailConfirm", member.email.trim());
  url.searchParams.set("phone", normalizeMemberPhoneForXceed(member.phone));
  url.searchParams.set("idNumber", member.barcode.trim());

  return url.toString();
}
