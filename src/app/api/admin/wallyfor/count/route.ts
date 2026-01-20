import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = (process.env.SUPABASE_URL || "").trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE || "").trim();
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: "missing_env (SUPABASE_URL/SUPABASE_SERVICE_ROLE)" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { count, error } = await supabase
      .from("wallyfor_members") // <-- se la tabella ha nome diverso, cambia SOLO qui
      .select("*", { count: "exact", head: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, total: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
