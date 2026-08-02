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
  url.searchParams.set("phone", member.phone.trim());
  url.searchParams.set("idNumber", member.barcode.trim());

  return url.toString();
}
