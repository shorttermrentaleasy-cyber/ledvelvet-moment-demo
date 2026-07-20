import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function assertEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "")
    .toLowerCase()
    .trim();

  if (!email) {
    return {
      ok: false as const,
      code: 401 as const,
    };
  }

  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) {
    return {
      ok: false as const,
      code: 403 as const,
    };
  }

  return {
    ok: true as const,
    email,
  };
}

type ImportRow = {
  barcode: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  membership_group?: string | null;
  status?: string | null;
  membership_issued_at?: string | null;
  membership_expires_at?: string | null;
  membership_year?: string | null;
  raw?: unknown;
};

function nullableText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function nullableIsoDate(value: unknown): string | null {
  const normalized = nullableText(value);

  if (!normalized) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : null;
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "unauthorized",
        },
        {
          status: admin.code,
        }
      );
    }

    const body = await req.json().catch(() => null);
    const rows = body?.rows as ImportRow[] | undefined;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_rows",
        },
        {
          status: 400,
        }
      );
    }

    const nowIso = new Date().toISOString();

    const cleaned = rows
      .map((row) => ({
        barcode: String(row?.barcode || "").trim(),
        first_name: nullableText(row?.first_name),
        last_name: nullableText(row?.last_name),
        full_name: nullableText(row?.full_name),
        email: nullableText(row?.email),
        membership_group: nullableText(row?.membership_group),
        status: nullableText(row?.status) || "DA VERIFICARE",
        membership_issued_at: nullableIsoDate(
          row?.membership_issued_at
        ),
        membership_expires_at: nullableIsoDate(
          row?.membership_expires_at
        ),
        membership_year: nullableText(row?.membership_year),
        raw:
          row?.raw && typeof row.raw === "object"
            ? row.raw
            : {},
        source: "xls",
        is_present: true,
        missing_since: null,
        updated_at: nowIso,
      }))
      .filter((row) => row.barcode);

    if (cleaned.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_valid_rows",
        },
        {
          status: 400,
        }
      );
    }

    const supabase = createClient(
      assertEnv("SUPABASE_URL"),
      assertEnv("SUPABASE_SERVICE_ROLE"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    let { error } = await supabase
      .from("wallyfor_members")
      .upsert(cleaned, {
        onConflict: "barcode",
      });

    if (error && /source|is_present|missing_since/i.test(error.message)) {
      const legacyRows = cleaned.map(
        ({ source: _source, is_present: _isPresent, missing_since: _missingSince, ...row }) => row
      );
      const fallback = await supabase
        .from("wallyfor_members")
        .upsert(legacyRows, { onConflict: "barcode" });
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      imported: cleaned.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "server_error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}
