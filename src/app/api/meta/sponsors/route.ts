import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/authOptions";
import {
  fetchSponsorMetaFromAirtable,
  SponsorMetaError,
} from "@/lib/sponsor-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = (session.user?.email || "").toLowerCase().trim();
    const allowed = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (!email || !allowed.includes(email)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { status, category } = await fetchSponsorMetaFromAirtable();

    return NextResponse.json({
      ok: true,
      status,
      category,
      statuses: status.map((s: any) => s.label),
      categories: category.map((c: any) => c.label),
    });
  } catch (err: any) {
    console.error(err);
    if (err instanceof SponsorMetaError) {
      return NextResponse.json(
        { ok: false, error: err.message, data: err.details },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
