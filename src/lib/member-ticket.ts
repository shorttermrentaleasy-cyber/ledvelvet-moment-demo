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

function isXceedEventUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  const isXceed = host === "xceed.me" || host.endsWith(".xceed.me");
  if (url.protocol !== "https:" || !isXceed) return false;

  const parts = url.pathname.split("/").filter(Boolean);
  const eventIndex = parts.findIndex((part) => part.toLowerCase() === "event");
  return eventIndex >= 0 && parts.slice(eventIndex + 1).some((part) => /^\d+$/.test(part));
}

export function buildMemberTicketBaseUrl(eventUrl: string, promoCode: string) {
  const code = promoCode.trim();
  if (!code) return null;

  let url: URL;
  try {
    url = new URL(eventUrl);
  } catch {
    return null;
  }

  if (!isXceedEventUrl(url)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const checkoutIndex = parts.findIndex((part) => part.toLowerCase() === "checkout");
  if (checkoutIndex >= 0) parts.splice(checkoutIndex, 3);

  const channelIndex = parts.findIndex((part) => part.toLowerCase() === "channel");
  const insertAt = channelIndex >= 0 ? channelIndex : parts.length;
  parts.splice(insertAt, 0, "checkout", "promocode", code);
  url.pathname = `/${parts.map((part) => encodeURIComponent(part)).join("/")}`;

  return isValidMemberTicketBaseUrl(url.toString()) ? url.toString() : null;
}

export function getMemberTicketPromoCode(baseUrl: string) {
  if (!isValidMemberTicketBaseUrl(baseUrl)) return "";

  const parts = new URL(baseUrl).pathname.split("/").filter(Boolean);
  const promoIndex = parts.findIndex((part) => part.toLowerCase() === "promocode");
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
