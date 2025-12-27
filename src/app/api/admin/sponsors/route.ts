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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_SPONSOR = process.env.AIRTABLE_TABLE_SPONSOR;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_SPONSOR) {
    return json(500, { ok: false, error: "Missing Airtable env" });
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_SPONSOR
  )}?pageSize=100&sort%5B0%5D%5Bfield%5D=Brand%20Name&sort%5B0%5D%5Bdirection%5D=asc`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const text = await r.text();
  if (!r.ok) {
    console.error("Airtable sponsors error:", r.status, text);
    return json(500, { ok: false, error: "Airtable error" });
  }

  const data = text ? JSON.parse(text) : {};
  const records = (data.records || []).map((rec: any) => ({
    id: rec.id,
    label: (rec.fields?.["Brand Name"] || "").toString().trim(),
  })).filter((x: any) => x.label);

  return json(200, { ok: true, sponsors: records });
}
