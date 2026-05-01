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

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from("door_gates")
      .select("*")
      .order("gate_id", { ascending: true });

    if (error) {
      return gateErrorResponse(error);
    }

    return NextResponse.json({
      ok: true,
      gates: data || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const gate_id = String(body.gate_id || "").trim();
    const name = String(body.name || "").trim();
    const door_role = String(body.door_role || "").trim();
    const xceed_email = String(body.xceed_email || "").trim().toLowerCase();
    const active = body.active === false ? false : true;

    if (!gate_id || !name || !door_role || !xceed_email) {
      return NextResponse.json(
        { ok: false, error: "Compila nome gate, Gate ID, ruolo ed email Xceed." },
        { status: 400 }
      );
    }

    if (!["ordinary", "loyalty", "privileged"].includes(door_role)) {
      return NextResponse.json(
        { ok: false, error: "Ruolo gate non valido." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("door_gates")
      .insert({
        gate_id,
        name,
        door_role,
        xceed_email,
        active,
      })
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