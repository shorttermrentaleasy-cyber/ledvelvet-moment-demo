import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

function gateErrorResponse(error: any) {
  const msg = error?.message || "";
  const details = error?.details || "";
  const hint = error?.hint || "";
  const fullError = `${msg} ${details} ${hint}`;

  if (error?.code === "23505" && fullError.includes("xceed_email")) {
    return NextResponse.json(
      { ok: false, error: "Email Xceed già associata a un altro gate." },
      { status: 400 }
    );
  }

  if (error?.code === "23505" && fullError.includes("gate_id")) {
    return NextResponse.json(
      { ok: false, error: "Gate ID già esistente. Usa un codice diverso." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: false, error: msg || "Errore salvataggio gate" },
    { status: 500 }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await req.json();

    const patch: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.gate_id !== undefined) {
      patch.gate_id = String(body.gate_id).trim();
    }

    if (body.name !== undefined) {
      patch.name = String(body.name).trim();
    }

    if (body.xceed_email !== undefined) {
      patch.xceed_email = String(body.xceed_email).trim().toLowerCase();
    }

    if (body.active !== undefined) {
      patch.active = Boolean(body.active);
    }

    if (body.door_role !== undefined) {
      const role = String(body.door_role).trim();

      if (!["ordinary", "loyalty", "privileged"].includes(role)) {
        return NextResponse.json(
          { ok: false, error: "Ruolo gate non valido." },
          { status: 400 }
        );
      }

      patch.door_role = role;
    }

    const { data, error } = await supabase
      .from("door_gates")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return gateErrorResponse(error);
    }

    return NextResponse.json({
      ok: true,
      gate: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "unknown error" },
      { status: 500 }
    );
  }
}