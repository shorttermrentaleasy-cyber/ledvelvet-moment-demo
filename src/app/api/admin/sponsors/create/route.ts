import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function isAdmin(email?: string | null) {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

function trim(v: any) {
  return (v ?? "").toString().trim();
}

function isHttpUrl(v: string) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({}));

    const brandName = trim(body.brandName);
    const status = trim(body.status);
    const category = trim(body.category);
    const website = trim(body.website);
    const logoUrl = trim(body.logoUrl);
    const email = trim(body.email);
    const phone = trim(body.phone);
    const notes = trim(body.notes);

    if (!brandName) return json(400, { ok: false, error: "Brand Name obbligatorio" });
    if (!status) return json(400, { ok: false, error: "Status obbligatorio" });
    if (!isHttpUrl(website)) return json(400, { ok: false, error: "WebSite non valido (http/https)" });
    if (!isHttpUrl(logoUrl)) return json(400, { ok: false, error: "Logo URL non valido (http/https)" });

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_SPONSOR = process.env.AIRTABLE_TABLE_SPONSOR;

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_SPONSOR) {
      return json(500, { ok: false, error: "Missing Airtable env" });
    }

    const fields: Record<string, any> = {
      "Brand Name": brandName,
      Status: status,
      Category: category || undefined,
      WebSite: website || undefined,
      Email: email || undefined,
      Phone: phone || undefined,
      Notes: notes || undefined,
    };

    if (logoUrl) fields["Logo"] = [{ url: logoUrl }];

    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_SPONSOR
    )}`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }] }),
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("Airtable sponsor create error:", r.status, text);
      return json(500, { ok: false, error: "Airtable error" });
    }

    const data = text ? JSON.parse(text) : {};
    const recordId = data?.records?.[0]?.id || null;

    return json(200, { ok: true, recordId });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: "Server error" });
  }
}
