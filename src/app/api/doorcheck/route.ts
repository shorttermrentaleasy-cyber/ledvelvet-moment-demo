import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

type DoorcheckBody = {
  event_id?: string;
  event_ref?: string;

  qr?: string;
  device_id?: string;

  mode?: "scan" | "manual";
  full_name?: string;
  phone?: string;
  email?: string;
};

function isDigitsOnly(s: string) {
  return /^[0-9]+$/.test(s);
}

function truthyString(s?: string) {
  const t = (s || "").trim();
  return t.length ? t : null;
}

function buildDisplayName(opts: {
  kind: "ETS" | "SRL" | "XCEED";
  member?: { first_name?: string | null; last_name?: string | null; email?: string | null };
  legacy?: { full_name?: string | null; phone?: string | null };
}) {
  if (opts.kind === "ETS") {
    const fn = (opts.member?.first_name || "").trim();
    const ln = (opts.member?.last_name || "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || opts.member?.email || "Socio";
  }
  if (opts.kind === "SRL") {
    return opts.legacy?.full_name || opts.legacy?.phone || "Ospite";
  }
  if (opts.kind === "XCEED") {
    return opts.legacy?.full_name || "Xceed guest";
  }
  return "Ospite";
}

export async function POST(req: Request) {
  try {
    // 1) API key
    const got = (req.headers.get("x-api-key") || "").trim();
    const expected = (process.env.DOOR_API_KEY || "").trim();
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: DOOR_API_KEY missing" },
        { status: 500 }
      );
    }
    if (!got || got !== expected) return unauthorized("Invalid API key");

    const body = (await req.json()) as DoorcheckBody;
    const mode = ((body.mode || "scan").trim() as "scan" | "manual") || "scan";
    const qrRaw = (body.qr || "").trim();

    const supabase = supabaseAdmin();

    // 2) resolve event
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

    // 3) MANUAL SRL (NO DUPLICATI)
    if (mode === "manual") {
      const full_name = truthyString(body.full_name);
      const phoneRaw = truthyString(body.phone);
      const email = truthyString(body.email);

      if (!full_name && !phoneRaw) {
        return NextResponse.json(
          { ok: false, error: "Manual mode requires full_name or phone" },
          { status: 400 }
        );
      }

      // normalizzo telefono (minimo)
      const phone = phoneRaw ? phoneRaw.replace(/\s+/g, "").trim() : null;

      // 1) trova o crea legacy_people per telefono (se presente)
      let legacyPersonId: string | null = null;

      if (phone) {
        const { data: existing, error: exErr } = await supabase
          .from("legacy_people")
          .select("id")
          .eq("phone", phone)
          .limit(1);

        if (exErr) {
          return NextResponse.json({ ok: false, error: exErr.message }, { status: 500 });
        }

        if (existing && existing.length > 0) {
          legacyPersonId = existing[0].id;
        }
      }

      if (!legacyPersonId) {
        const { data: created, error: crErr } = await supabase
          .from("legacy_people")
          .insert({
            source: "guest",
            full_name: full_name,
            phone: phone,
            email: email,
            notes: "manual_created",
            raw: { from: "doorcheck_manual" },
          })
          .select("id")
          .maybeSingle();

        if (crErr) return NextResponse.json({ ok: false, error: crErr.message }, { status: 500 });
        legacyPersonId = created?.id || null;
      }

      if (!legacyPersonId) {
        return NextResponse.json({ ok: false, error: "Failed to resolve legacy person" }, { status: 500 });
      }

      // 2) scanned_code coerente: se ho phone uso MANUAL:<phone>
      const scanned_code = phone ? `MANUAL:${phone}` : "MANUAL";

      // 3) già check-in su questo evento?
      const { data: already, error: aErr } = await supabase
        .from("checkins")
        .select("id")
        .eq("event_id", eventId)
        .eq("legacy_person_id", legacyPersonId)
        .limit(1);

      if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

      if (already && already.length > 0) {
        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "SRL",
          status: "already",
          legacy_person_id: legacyPersonId,
          display_name: buildDisplayName({ kind: "SRL", legacy: { full_name, phone } }),
        });
      }

      // 4) inserisci check-in SRL
      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: legacyPersonId,
          result: "allowed",
          reason: "srl_created",
          method: "lv_manual",
          kind: "SRL",
          scanned_code,
        })
        .select("id")
        .maybeSingle();

      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

      return NextResponse.json({
        ok: true,
        allowed: true,
        kind: "SRL",
        status: "created_and_checked_in",
        checkin_id: ins?.id || null,
        legacy_person_id: legacyPersonId,
        display_name: buildDisplayName({ kind: "SRL", legacy: { full_name, phone } }),
      });
    }

    // 4) SCAN
    if (!qrRaw) return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });

    const isWallyBarcode = isDigitsOnly(qrRaw);
    const method: "lv_qr" | "wally_barcode" = isWallyBarcode ? "wally_barcode" : "lv_qr";

    /**
     * ✅ PATCH XCEED (prima di member_cards)
     * Se QR non numerico, prova a matchare xceed_tickets
     */
    if (!isWallyBarcode) {
      const { data: ticket, error: tErr } = await supabase
        .from("xceed_tickets")
        .select("id, legacy_person_id")
        .eq("event_id", eventId)
        .eq("qr_code", qrRaw)
        .maybeSingle();

      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      if (ticket?.id) {
        let legacyPersonId: string | null = (ticket.legacy_person_id as any) || null;

        // se manca, crea guest e collega al ticket
        if (!legacyPersonId) {
          const { data: newLp, error: newLpErr } = await supabase
            .from("legacy_people")
            .insert({
              source: "guest",
              full_name: null,
              email: null,
              phone: null,
              notes: "xceed_ticket",
              raw: { xceed_ticket_id: ticket.id, qr_code: qrRaw },
            })
            .select("id")
            .maybeSingle();

          if (newLpErr) return NextResponse.json({ ok: false, error: newLpErr.message }, { status: 500 });

          legacyPersonId = newLp?.id || null;
          if (!legacyPersonId) {
            return NextResponse.json({ ok: false, error: "Failed to create legacy person for XCEED ticket" }, { status: 500 });
          }

          const { error: upErr } = await supabase
            .from("xceed_tickets")
            .update({ legacy_person_id: legacyPersonId })
            .eq("id", ticket.id);

          if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
        }

        // fetch legacy info for display (best-effort)
        let legacyInfo: { full_name: string | null; phone: string | null } = { full_name: null, phone: null };
        try {
          const { data: lp } = await supabase
            .from("legacy_people")
            .select("full_name, phone")
            .eq("id", legacyPersonId)
            .maybeSingle();
          if (lp) legacyInfo = { full_name: lp.full_name || null, phone: lp.phone || null };
        } catch {}

        // already?
        const { data: already, error: aErr } = await supabase
          .from("checkins")
          .select("id")
          .eq("event_id", eventId)
          .eq("legacy_person_id", legacyPersonId)
          .eq("result", "allowed")
          .limit(1);

        if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

        if (already && already.length > 0) {
          return NextResponse.json({
            ok: true,
            kind: "XCEED",
            status: "already",
            allowed: true,
            legacy_person_id: legacyPersonId,
            display_name: buildDisplayName({ kind: "XCEED", legacy: legacyInfo }),
          });
        }

        // ✅ insert checkin con legacy_person_id -> vincolo XOR rispettato
        const { data: ins, error: insErr } = await supabase
          .from("checkins")
          .insert({
            event_id: eventId,
            legacy_person_id: legacyPersonId,
            result: "allowed",
            reason: "xceed_ok",
            method: "lv_qr",
            kind: "XCEED",
            scanned_code: qrRaw,
          })
          .select("id")
          .maybeSingle();

        if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

        // opzionale: memorizza checkin_id sul ticket
        await supabase.from("xceed_tickets").update({ checkin_id: ins?.id || null }).eq("id", ticket.id);

        return NextResponse.json({
          ok: true,
          kind: "XCEED",
          status: "checked_in",
          allowed: true,
          legacy_person_id: legacyPersonId,
          checkin_id: ins?.id || null,
          display_name: buildDisplayName({ kind: "XCEED", legacy: legacyInfo }),
        });
      }
    }

    // ---- ETS flow (come avevi tu) ----
    let memberId: string | null = null;

    if (isWallyBarcode) {
      const { data: m, error: mErr } = await supabase
        .from("members")
        .select("id")
        .eq("legacy_barcode", qrRaw)
        .maybeSingle();

      if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });

      if (!m) return NextResponse.json({ ok: true, allowed: false, kind: "UNKNOWN", status: "denied", reason: "invalid_barcode" });
      memberId = m.id;
    } else {
      const { data: card, error: cardErr } = await supabase
        .from("member_cards")
        .select("member_id, revoked")
        .eq("qr_secret", qrRaw)
        .maybeSingle();

      if (cardErr) return NextResponse.json({ ok: false, error: cardErr.message }, { status: 500 });

      if (!card) return NextResponse.json({ ok: true, allowed: false, kind: "UNKNOWN", status: "denied", reason: "invalid_qr" });

      if (card.revoked) {
        await supabase.from("checkins").insert({
          event_id: eventId,
          member_id: card.member_id,
          result: "denied",
          reason: "card_revoked",
          method,
          kind: "ETS",
          scanned_code: qrRaw,
        });
        return NextResponse.json({ ok: true, allowed: false, kind: "ETS", status: "denied", reason: "card_revoked" });
      }

      memberId = card.member_id;
    }

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
        kind: "ETS",
        scanned_code: qrRaw,
      });
      return NextResponse.json({ ok: true, allowed: false, kind: "ETS", status: "denied", reason: "member_not_found" });
    }

    // already? (allowed resta true, status=already)
    const { data: already, error: aErr } = await supabase
      .from("checkins")
      .select("id")
      .eq("event_id", eventId)
      .eq("member_id", member.id)
      .eq("result", "allowed")
      .limit(1);

    if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

    if (already && already.length > 0) {
      return NextResponse.json({
        ok: true,
        allowed: true,
        kind: "ETS",
        status: "already",
        member_id: member.id,
        display_name: buildDisplayName({ kind: "ETS", member }),
      });
    }

    // allowed ETS
    await supabase.from("checkins").insert({
      event_id: eventId,
      member_id: member.id,
      result: "allowed",
      reason: "ets_ok",
      method,
      kind: "ETS",
      scanned_code: qrRaw,
    });

    return NextResponse.json({
      ok: true,
      allowed: true,
      kind: "ETS",
      status: "checked_in",
      member_id: member.id,
      display_name: buildDisplayName({ kind: "ETS", member }),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
