import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import {
  createPendingWallyforMember,
  PendingWallyforMember,
  WallyforConnectError,
} from "@/lib/wallyfor-connect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_CONFIRMATION = "CREATE_WALLYFOR_PENDING_TEST";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").toLowerCase().trim();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email));
}

function text(value: unknown, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (text(body.confirm) !== TEST_CONFIRMATION) {
      return NextResponse.json(
        {
          ok: false,
          error: "confirmation_required",
          expected: TEST_CONFIRMATION,
        },
        { status: 400 }
      );
    }

    const member: PendingWallyforMember = {
      nome: text(body.nome, 100),
      cognome: text(body.cognome, 100),
      email: text(body.email, 254).toLowerCase(),
      telefono: text(body.telefono, 30),
      prefisso: text(body.prefisso, 8),
      data_nascita: text(body.data_nascita, 10),
      sesso: text(body.sesso, 20) || undefined,
      codice_fiscale: text(body.codice_fiscale, 32).toUpperCase() || undefined,
      privacy: body.privacy === true,
      termini: body.termini === true,
      promozionale: body.promozionale === true,
      foto: body.foto === true,
      maggiorenne: body.maggiorenne === true,
    };

    const missing = [
      !member.nome && "nome",
      !member.cognome && "cognome",
      !member.email && "email",
      !member.telefono && "telefono",
      !member.prefisso && "prefisso",
      !member.data_nascita && "data_nascita",
      !member.privacy && "privacy",
      !member.termini && "termini",
      !member.maggiorenne && "maggiorenne",
    ].filter(Boolean);

    if (
      missing.length ||
      !validEmail(member.email) ||
      !validDate(member.data_nascita)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_test_data",
          missing,
          invalid_email: Boolean(member.email && !validEmail(member.email)),
          invalid_date: Boolean(
            member.data_nascita && !validDate(member.data_nascita)
          ),
        },
        { status: 400 }
      );
    }

    const result = await createPendingWallyforMember(member);
    return NextResponse.json({ ok: true, mode: "pending", result });
  } catch (error) {
    if (error instanceof WallyforConnectError) {
      return NextResponse.json(
        { ok: false, error: error.code, message: error.message },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
