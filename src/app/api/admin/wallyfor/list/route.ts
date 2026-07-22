import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").toLowerCase().trim();
  const allowed = String(process.env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email));
}

function safeLike(value: string) {
  return `%${value.replace(/[%_]/g, (match) => `\\${match}`)}%`;
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") || "").trim();
    const status = (url.searchParams.get("status") || "all").trim();
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE"), { auth: { persistSession: false } });
    const fields = "id,barcode,first_name,last_name,full_name,email,phone,membership_group,status,raw,membership_issued_at,membership_expires_at,source,is_present,missing_since,last_seen_at,updated_at";
    let query = supabase.from("wallyfor_members").select(fields, { count: "exact" }).order("full_name", { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1);
    if (status !== "all") query = query.eq("status", status);
    if (search) {
      const like = safeLike(search);
      query = query.or(`barcode.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`);
    }
    const { data, error, count } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data || [], count: Number(count || 0), limit, offset });
  } catch (reason) {
    return NextResponse.json({ ok: false, error: reason instanceof Error ? reason.message : "server_error" }, { status: 500 });
  }
}
