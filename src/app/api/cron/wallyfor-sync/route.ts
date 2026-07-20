import { NextResponse } from "next/server";
import { syncWallyforSnapshot } from "@/lib/wallyfor-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  const received = String(req.headers.get("authorization") || "");
  if (!expected || received !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await syncWallyforSnapshot()) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
