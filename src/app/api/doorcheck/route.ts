import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

type DoorcheckBody = {
  event_id?: string;
  event_ref?: string; // opzionale: events.xceed_event_ref
  qr?: string;        // LV qr_secret (hex) oppure Wally legacy_barcode (solo numeri)
  device_id?: string; // opzionale
};

function isDigitsOnly(s: string) {
  return /^[0-9]+$/.test(s);
}

export async function POST(req: Request) {
  try {
    // 1) API key (robusto)
    const got = (req.headers.get("x-api-key") || "").trim();
    const expected = (process.env.DOOR_API_KEY || "").trim();

    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: DOOR_API_KEY missing" },
        { status: 500 }
      );
    }
    if (!got || got !== expected) {
      return unauthorized("Invalid API key");
    }

    const body = (await req.json()) as DoorcheckBody;
    const qrRaw = (body.qr || "").trim();
    if (!qrRaw) return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });

    const supabase = supabaseAdmin();

    // 2) Risolvi evento
    let eventId = (body.event_id || "").trim();

    if (!eventId) {
      const eventRef = (body.event_ref || "").trim();
      if (!eventRef) {
        return NextResponse.json({ ok: false, error: "Missing event_id or event_ref" }, { status: 400 });
      }

      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id")
        .eq("xceed_event_ref", eventRef)
        .maybeSingle();

      if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
      if (!ev) return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });

      eventId = ev.id;
    } else {
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id")
        .eq("id", eventId)
        .maybeSingle();

      if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
      if (!ev) return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    }

    // 3) Risolvi socio
    const isWallyBarcode = isDigitsOnly(qrRaw);
    const method: "lv_qr" | "wally_barcode" = isWallyBarcode ? "wally_barcode" : "lv_qr";

    let memberId: string | null = null;

    if (isWallyBarcode) {
      // Wallyfor Wallet: members.legacy_barcode
      const { data: m, error: mErr } = await supabase
        .from("members")
        .select("id")
        .eq("legacy_barcode", qrRaw)
        .maybeSingle();

      if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });

      if (!m) {
        await supabase.from("checkins").insert({
          event_id: eventId,
          member_id: null,
          result: "denied",
          reason: "invalid_barcode",
          method,
        });
        return NextResponse.json({ ok: true, allowed: false, reason: "invalid_barcode" });
      }
      memberId = m.id;
    } else {
      // LV People: member_cards.qr_secret
      const { data: card, error: cardErr } = await supabase
        .from("member_cards")
        .select("member_id, revoked")
        .eq("qr_secret", qrRaw)
        .maybeSingle();

      if (cardErr) return NextResponse.json({ ok: false, error: cardErr.message }, { status: 500 });

      if (!card) {
        await supabase.from("checkins").insert({
          event_id: eventId,
          member_id: null,
          result: "denied",
          reason: "invalid_qr",
          method,
        });
        return NextResponse.json({ ok: true, allowed: false, reason: "invalid_qr" });
      }

      if (card.revoked) {
        await supabase.from("checkins").insert({
          event_id: eventId,
          member_id: card.member_id,
          result: "denied",
          reason: "card_revoked",
          method,
        });
        return NextResponse.json({ ok: true, allowed: false, reason: "card_revoked" });
      }

      memberId = card.member_id;
    }

    // 4) Carica socio
    const { data: member, error: memErr } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, legacy")
      .eq("id", memberId)
      .maybeSingle();

    if (memErr) return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });

    if (!member) {
      await supabase.from("checkins").insert({
        event_id: eventId,
        member_id: memberId,
        result: "denied",
        reason: "member_not_found",
        method,
      });
      return NextResponse.json({ ok: true, allowed: false, reason: "member_not_found" });
    }

    // 5) Anti doppio ingresso
    const { data: already, error: aErr } = await supabase
      .from("checkins")
      .select("id")
      .eq("event_id", eventId)
      .eq("member_id", member.id)
      .eq("result", "allowed")
      .limit(1);

    if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

    if (already && already.length > 0) {
      await supabase.from("checkins").insert({
        event_id: eventId,
        member_id: member.id,
        result: "denied",
        reason: "already_checked_in",
        method,
      });
      return NextResponse.json({ ok: true, allowed: false, reason: "already_checked_in" });
    }

    // 6) Regola ETS MVP
    let allowed = false;
    let reason = "";

    if (member.legacy) {
      allowed = true;
      reason = "legacy_ok";
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const { data: ms, error: msErr } = await supabase
        .from("memberships")
        .select("id")
        .eq("member_id", member.id)
        .eq("status", "active")
        .or(`end_date.is.null,end_date.gte.${today}`)
        .limit(1);

      if (msErr) return NextResponse.json({ ok: false, error: msErr.message }, { status: 500 });

      if (ms && ms.length > 0) {
        allowed = true;
        reason = "membership_active";
      } else {
        allowed = false;
        reason = "not_member_active";
      }
    }

    // 7) Log
    await supabase.from("checkins").insert({
      event_id: eventId,
      member_id: member.id,
      result: allowed ? "allowed" : "denied",
      reason,
      method,
    });

    return NextResponse.json({
      ok: true,
      allowed,
      reason,
      method,
      member: {
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        legacy: member.legacy,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
