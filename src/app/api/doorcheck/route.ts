// src/app/api/doorcheck/route.ts
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
  event_ref?: string; // opzionale: events.xceed_event_ref
  mode?: "scan" | "manual";
  qr?: string; // barcode/qr scansionato o testo inserito
  full_name?: string; // per mode=manual
  phone?: string; // per mode=manual
  email?: string; // opzionale per mode=manual
  device_id?: string; // opzionale
};

function isDigitsOnly(s: string) {
  return /^[0-9]+$/.test(s);
}

function normalizeEmail(email: string | null | undefined) {
  const e = (email || "").trim().toLowerCase();
  return e || null;
}

function normalizePhone(phone: string | null | undefined) {
  const p = (phone || "").trim().replace(/[^\d+]/g, "");
  return p || null;
}

function buildFullName(first: string | null | undefined, last: string | null | undefined) {
  const fn = (first || "").trim();
  const ln = (last || "").trim();
  const joined = `${fn} ${ln}`.trim();
  return joined || null;
}

async function resolveEventId(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string | null,
  eventRef: string | null
) {
  const eid = (eventId || "").trim();
  if (eid) {
    const { data: ev, error: evErr } = await supabase.from("events").select("id").eq("id", eid).maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev) return null;
    return ev.id as string;
  }

  const ref = (eventRef || "").trim();
  if (!ref) return null;

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("id")
    .eq("xceed_event_ref", ref)
    .maybeSingle();
  if (evErr) throw new Error(evErr.message);
  if (!ev) return null;
  return ev.id as string;
}

async function getEventPolicy(supabase: ReturnType<typeof supabaseAdmin>, eventId: string) {
  // campi opzionali: se non esistono, default false
  const { data: ev, error } = await supabase
    .from("events")
    .select("id, require_ticket, require_membership")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    require_ticket: Boolean((ev as any)?.require_ticket),
    require_membership: Boolean((ev as any)?.require_membership),
  };
}

async function findMemberByBarcodeOrCard(
  supabase: ReturnType<typeof supabaseAdmin>,
  qrRaw: string
): Promise<{ id: string; display_name: string | null; email: string | null; phone: string | null } | null> {
  // 1) barcode numerico (members.legacy_barcode)
  if (isDigitsOnly(qrRaw)) {
    const { data: m, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, phone")
      .eq("legacy_barcode", qrRaw)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) return null;

    return {
      id: (m as any).id,
      display_name: buildFullName((m as any).first_name, (m as any).last_name),
      email: (m as any).email ?? null,
      phone: (m as any).phone ?? null,
    };
  }

  // 2) QR tessera LV (member_cards.qr_secret)
  const { data: card, error: cErr } = await supabase
    .from("member_cards")
    .select("member_id, revoked")
    .eq("qr_secret", qrRaw)
    .maybeSingle();

  if (cErr) throw new Error(cErr.message);
  if (!card) return null;
  if ((card as any).revoked) return null;

  const { data: m, error: mErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, phone")
    .eq("id", (card as any).member_id)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!m) return null;

  return {
    id: (m as any).id,
    display_name: buildFullName((m as any).first_name, (m as any).last_name),
    email: (m as any).email ?? null,
    phone: (m as any).phone ?? null,
  };
}

async function memberAlreadyCheckedIn(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("checkins")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", memberId)
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return (data[0] as any).id as string;
}

async function legacyAlreadyCheckedIn(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  legacyPersonId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("checkins")
    .select("id")
    .eq("event_id", eventId)
    .eq("legacy_person_id", legacyPersonId)
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return (data[0] as any).id as string;
}

async function resolveMemberByEmailOrPhone(
  supabase: ReturnType<typeof supabaseAdmin>,
  emailNorm: string | null,
  phoneNorm: string | null
): Promise<{ id: string; display_name: string | null } | { ambiguous: true } | null> {
  // email (primario)
  if (emailNorm) {
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name")
      .ilike("email", emailNorm)
      .limit(2);

    if (error) throw new Error(error.message);
    if (data && data.length === 1) {
      const m = data[0] as any;
      return { id: m.id as string, display_name: buildFullName(m.first_name, m.last_name) };
    }
    if (data && data.length > 1) return { ambiguous: true };
  }

  // phone (fallback)
  if (phoneNorm) {
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("phone", phoneNorm)
      .limit(2);

    if (error) throw new Error(error.message);
    if (data && data.length === 1) {
      const m = data[0] as any;
      return { id: m.id as string, display_name: buildFullName(m.first_name, m.last_name) };
    }
    if (data && data.length > 1) return { ambiguous: true };
  }

  return null;
}

async function memberHasTicketForEvent(
  supabase: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  emailNorm: string | null,
  phoneNorm: string | null
) {
  if (!emailNorm && !phoneNorm) return false;

  const { data, error } = await supabase
    .from("xceed_tickets")
    .select("id")
    .eq("event_id", eventId)
    .or(
      [
        emailNorm ? `buyer_email_norm.eq.${emailNorm}` : null,
        phoneNorm ? `buyer_phone_norm.eq.${phoneNorm}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .limit(1);

  if (error) throw new Error(error.message);
  return Boolean(data && data.length > 0);
}

async function upsertLegacyPerson(
  supabase: ReturnType<typeof supabaseAdmin>,
  args: { full_name?: string | null; email?: string | null; phone?: string | null; source?: string | null }
) {
  const emailNorm = normalizeEmail(args.email || null);
  const phoneNorm = normalizePhone(args.phone || null);

  // prova a trovare per email/phone (se presenti) per evitare duplicati
  if (emailNorm || phoneNorm) {
    const orParts: string[] = [];
    if (emailNorm) orParts.push(`email.ilike.${emailNorm}`);
    if (phoneNorm) orParts.push(`phone.eq.${phoneNorm}`);

    const { data: existing, error: exErr } = await supabase
      .from("legacy_people")
      .select("id")
      .or(orParts.join(","))
      .limit(2);

    if (exErr) throw new Error(exErr.message);

    if (existing && existing.length === 1) {
      const id = (existing[0] as any).id as string;
      return { id };
    }
  }

  const { data: ins, error: insErr } = await supabase
    .from("legacy_people")
    .insert({
      source: args.source || "guest",
      full_name: (args.full_name || "").trim() || null,
      email: emailNorm,
      phone: phoneNorm,
    })
    .select("id")
    .maybeSingle();

  if (insErr) throw new Error(insErr.message);

  return { id: (ins as any).id as string };
}

export async function POST(req: Request) {
  try {
    // 1) API key
    const got = (req.headers.get("x-api-key") || "").trim();
    const expected = (process.env.DOOR_API_KEY || "").trim();
    if (!expected) {
      return NextResponse.json({ ok: false, error: "Server misconfigured: DOOR_API_KEY missing" }, { status: 500 });
    }
    if (!got || got !== expected) return unauthorized("Invalid API key");

    const body = (await req.json()) as DoorcheckBody;
    const supabase = supabaseAdmin();

    // 2) evento
    const eventId = await resolveEventId(supabase, body.event_id || null, body.event_ref || null);
    if (!eventId) return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });

    // 3) policy evento
    const policy = await getEventPolicy(supabase, eventId);

    const mode = body.mode || "scan";
    const qrRaw = (body.qr || "").trim();

    // ======================================================
    // MODE: MANUAL (crea legacy person + checkin SRL)
    // ======================================================
    if (mode === "manual") {
      const fullName = (body.full_name || "").trim();
      const phoneNorm = normalizePhone(body.phone || null);
      const emailNorm = normalizeEmail(body.email || null);

      if (!fullName || !phoneNorm) {
        return NextResponse.json({ ok: false, error: "Missing full_name or phone" }, { status: 400 });
      }

      const legacy = await upsertLegacyPerson(supabase, {
        source: "guest",
        full_name: fullName,
        email: emailNorm,
        phone: phoneNorm,
      });

      const alreadyId = await legacyAlreadyCheckedIn(supabase, eventId, legacy.id);
      if (alreadyId) {
        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "SRL",
          status: "already",
          legacy_person_id: legacy.id,
          display_name: fullName,
        });
      }

      const scanned_code = qrRaw || `MANUAL:${phoneNorm}`;

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: legacy.id,
          result: "allowed",
          reason: "srl_created",
          method: "lv_manual",
          kind: "SRL",
          scanned_code,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      return NextResponse.json({
        ok: true,
        allowed: true,
        kind: "SRL",
        status: "created_and_checked_in",
        checkin_id: (ins as any)?.id || null,
        legacy_person_id: legacy.id,
        display_name: fullName,
        scanned_code,
      });
    }

    // ======================================================
    // MODE: SCAN
    // ======================================================
    if (!qrRaw) return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });

    // A) tessera socio (barcode Wally o QR LV)
    const member = await findMemberByBarcodeOrCard(supabase, qrRaw);
    if (member) {
      // policy: se richiede biglietto, verifica ticket su xceed_tickets via email/phone
      if (policy.require_ticket) {
        const hasTicket = await memberHasTicketForEvent(
          supabase,
          eventId,
          normalizeEmail(member.email),
          normalizePhone(member.phone)
        );
        if (!hasTicket) {
          return NextResponse.json({
            ok: true,
            allowed: false,
            kind: "ETS",
            status: "denied",
            reason: "missing_ticket",
            member_id: member.id,
            display_name: member.display_name,
          });
        }
      }

      const alreadyId = await memberAlreadyCheckedIn(supabase, eventId, member.id);
      if (alreadyId) {
        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "ETS",
          status: "already",
          member_id: member.id,
          display_name: member.display_name,
        });
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          member_id: member.id,
          result: "allowed",
          reason: policy.require_ticket ? "ets_ok_ticket_ok" : "ets_ok",
          method: isDigitsOnly(qrRaw) ? "wally_barcode" : "lv_qr",
          kind: "ETS",
          scanned_code: qrRaw,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      return NextResponse.json({
        ok: true,
        allowed: true,
        kind: "ETS",
        status: "checked_in",
        member_id: member.id,
        checkin_id: (ins as any)?.id || null,
        display_name: member.display_name,
      });
    }

    // B) ticket XCEED (xceed_tickets.qr_code)
    const { data: ticket, error: tErr } = await supabase
      .from("xceed_tickets")
      .select("id, legacy_person_id, buyer_name, buyer_email_norm, buyer_phone_norm")
      .eq("event_id", eventId)
      .eq("qr_code", qrRaw)
      .maybeSingle();

    if (tErr) throw new Error(tErr.message);

    if (ticket?.id) {
      const buyerEmail = (ticket as any).buyer_email_norm ? String((ticket as any).buyer_email_norm) : null;
      const buyerPhone = (ticket as any).buyer_phone_norm ? String((ticket as any).buyer_phone_norm) : null;
      const buyerName = ((ticket as any).buyer_name || "").toString().trim() || "Xceed guest";

      // policy: se richiede membership ETS, deve esistere un member matchato per email/phone del ticket
      if (policy.require_membership) {
        const m = await resolveMemberByEmailOrPhone(supabase, buyerEmail, buyerPhone);
        if (m && (m as any).ambiguous) {
          return NextResponse.json({
            ok: true,
            allowed: false,
            kind: "XCEED",
            status: "denied",
            reason: "ambiguous_member_match",
          });
        }
        if (!m) {
          return NextResponse.json({
            ok: true,
            allowed: false,
            kind: "XCEED",
            status: "denied",
            reason: "not_a_member",
          });
        }
      }

      // assicura legacy_person_id (serve per log e per mostrare nome)
      let legacyPersonId = (ticket as any).legacy_person_id as string | null;
      if (!legacyPersonId) {
        const legacy = await upsertLegacyPerson(supabase, {
          source: "guest",
          full_name: buyerName,
          email: buyerEmail,
          phone: buyerPhone,
        });
        legacyPersonId = legacy.id;

        const { error: updErr } = await supabase
          .from("xceed_tickets")
          .update({ legacy_person_id: legacyPersonId })
          .eq("id", (ticket as any).id);

        if (updErr) throw new Error(updErr.message);
      }

      const alreadyId = await legacyAlreadyCheckedIn(supabase, eventId, legacyPersonId);
      if (alreadyId) {
        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "XCEED",
          status: "already",
          legacy_person_id: legacyPersonId,
          display_name: buyerName,
        });
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: legacyPersonId,
          result: "allowed",
          reason: policy.require_membership ? "xceed_ok_member_required" : "xceed_ok",
          method: "xceed_qr",
          kind: "XCEED",
          scanned_code: qrRaw,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      return NextResponse.json({
        ok: true,
        allowed: true,
        kind: "XCEED",
        status: "checked_in",
        checkin_id: (ins as any)?.id || null,
        legacy_person_id: legacyPersonId,
        display_name: buyerName,
      });
    }

    // C) legacy_people barcode (numerico)
    if (isDigitsOnly(qrRaw)) {
      const { data: lp, error: lpErr } = await supabase
        .from("legacy_people")
        .select("id, full_name")
        .eq("legacy_barcode", qrRaw)
        .maybeSingle();

      if (lpErr) throw new Error(lpErr.message);

      if (lp?.id) {
        const alreadyId = await legacyAlreadyCheckedIn(supabase, eventId, (lp as any).id);
        if (alreadyId) {
          return NextResponse.json({
            ok: true,
            allowed: true,
            kind: "SRL",
            status: "already",
            legacy_person_id: (lp as any).id,
            display_name: (lp as any).full_name ?? null,
          });
        }

        const { data: ins, error: insErr } = await supabase
          .from("checkins")
          .insert({
            event_id: eventId,
            legacy_person_id: (lp as any).id,
            result: "allowed",
            reason: "srl_ok",
            method: "lv_qr",
            kind: "SRL",
            scanned_code: qrRaw,
          })
          .select("id")
          .maybeSingle();

        if (insErr) throw new Error(insErr.message);

        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "SRL",
          status: "checked_in",
          checkin_id: (ins as any)?.id || null,
          legacy_person_id: (lp as any).id,
          display_name: (lp as any).full_name ?? null,
        });
      }
    }

    // D) sconosciuto
    return NextResponse.json({
      ok: true,
      allowed: false,
      kind: "UNKNOWN",
      status: "denied",
      reason: "not_found",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
