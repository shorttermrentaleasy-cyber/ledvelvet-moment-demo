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
  qr?: string;
  full_name?: string; // manual
  phone?: string; // manual
  email?: string; // manual opzionale
  device_id?: string;
};

function isDigitsOnly(s: string) {
  return /^[0-9]+$/.test(s);
}

function normalizeEmail(email: string | null | undefined) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return null;
  if (!e.includes("@") || !e.includes(".")) return null;
  return e;
}

function normalizePhone(phone: string | null | undefined) {
  let p = String(phone ?? "").trim();
  if (!p) return null;
  p = p.replace(/[^\d+]/g, "");
  if (!p) return null;
  // normalizza "39xxxxxxxx" => "+39xxxxxxxx"
  if (/^39\d{8,}$/.test(p)) p = `+${p}`;
  return p.length >= 6 ? p : null;
}

function buildFullName(first: string | null | undefined, last: string | null | undefined) {
  const fn = (first || "").trim();
  const ln = (last || "").trim();
  const joined = `${fn} ${ln}`.trim();
  return joined || null;
}

/**
 * API KEY (DB ONLY)
 * Usa solo: public.door_api_keys(api_key text, active boolean)
 * RLS admin-only: con SERVICE_ROLE bypassa.
 */
async function isDoorApiKeyValid(supabase: ReturnType<typeof supabaseAdmin>, apiKey: string) {
  const k = (apiKey || "").trim();
  if (!k) return false;

  // ipotesi: door_api_keys(api_key text, active boolean)
  const { data, error } = await supabase
    .from("door_api_keys")
    .select("id")
    .eq("active", true)
    .eq("api_key", k)
    .limit(1);

  if (error) throw new Error(error.message);
  return !!(data && data.length > 0);
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

  const { data: ev, error: evErr } = await supabase.from("events").select("id").eq("xceed_event_ref", ref).maybeSingle();
  if (evErr) throw new Error(evErr.message);
  if (!ev) return null;
  return ev.id as string;
}

async function getEventPolicy(supabase: ReturnType<typeof supabaseAdmin>, eventId: string) {
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

  if (phoneNorm) {
    const candidates = new Set<string>();
    candidates.add(phoneNorm);
    if (phoneNorm.startsWith("+")) candidates.add(phoneNorm.slice(1));
    if (phoneNorm.startsWith("+39")) candidates.add(phoneNorm.replace(/^\+39/, ""));
    if (phoneNorm.startsWith("39")) candidates.add(phoneNorm.replace(/^39/, ""));

    const inArr = Array.from(candidates);

    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name")
      .in("phone", inArr)
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
  memberEmail: string | null,
  memberPhone: string | null
) {
  const emailNorm = normalizeEmail(memberEmail);
  const phoneNorm = normalizePhone(memberPhone);

  // 1) match email
  if (emailNorm) {
    const { data, error } = await supabase
      .from("xceed_tickets")
      .select("id")
      .eq("event_id", eventId)
      .ilike("email", emailNorm)
      .limit(1);

    if (error) throw new Error(error.message);
    if (data && data.length > 0) return true;
  }

  // 2) match phone con varianti
  if (phoneNorm) {
    const candidates = new Set<string>();
    candidates.add(phoneNorm);
    if (phoneNorm.startsWith("+")) candidates.add(phoneNorm.slice(1));
    if (phoneNorm.startsWith("+39")) candidates.add(phoneNorm.replace(/^\+39/, ""));
    if (phoneNorm.startsWith("39")) candidates.add(phoneNorm.replace(/^39/, ""));

    const inArr = Array.from(candidates);

    const { data, error } = await supabase
      .from("xceed_tickets")
      .select("id")
      .eq("event_id", eventId)
      .in("phone", inArr)
      .limit(1);

    if (error) throw new Error(error.message);
    if (data && data.length > 0) return true;
  }

  return false;
}

async function upsertLegacyPerson(
  supabase: ReturnType<typeof supabaseAdmin>,
  args: { full_name?: string | null; email?: string | null; phone?: string | null; source?: string | null }
) {
  const emailNorm = normalizeEmail(args.email || null);
  const phoneNorm = normalizePhone(args.phone || null);

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
    const supabase = supabaseAdmin();

    // ✅ API KEY (DB ONLY)
    const got = (req.headers.get("x-api-key") || "").trim();
    if (!got) return unauthorized("Missing API key");

    const ok = await isDoorApiKeyValid(supabase, got);
    if (!ok) return unauthorized("Invalid API key");

    // ✅ body (una sola volta)
    const body = (await req.json()) as DoorcheckBody;

    // ✅ resolve event
    const eventId = await resolveEventId(supabase, body.event_id || null, body.event_ref || null);
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    }

    // ✅ policy
    const policy = await getEventPolicy(supabase, eventId);

    // ✅ mode + qr
    const mode = (body.mode || "scan").trim() as "scan" | "manual";
    const qrRaw = (body.qr || "").trim();

    if (mode === "scan" && !qrRaw) {
      return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });
    }

    // =========================
    // MANUAL => SRL
    // =========================
    if (mode === "manual") {
      const fullName = (body.full_name || "").trim();
      const phoneNorm = normalizePhone(body.phone || null);
      const emailNorm = normalizeEmail(body.email || null);

      // coerente con UI: minimo nome O telefono
      if (!fullName && !phoneNorm) {
        return NextResponse.json({ ok: false, error: "Missing full_name or phone" }, { status: 400 });
      }

      const legacy = await upsertLegacyPerson(supabase, {
        source: "guest",
        full_name: fullName || null,
        email: emailNorm,
        phone: phoneNorm,
      });

      const alreadyId = await legacyAlreadyCheckedIn(supabase, eventId, legacy.id);
      if (alreadyId) {
        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "SRL",
          status: "Already Checked IN",
          legacy_person_id: legacy.id,
          display_name: fullName || null,
          checkin_id: alreadyId,
        });
      }

      const scanned_code = qrRaw || (phoneNorm ? `MANUAL:${phoneNorm}` : "MANUAL");

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
        display_name: fullName || null,
        scanned_code,
      });
    }

    // =========================
    // SCAN
    // =========================
    if (!qrRaw) return NextResponse.json({ ok: false, error: "Missing qr" }, { status: 400 });

    // A) tessera socio (ETS)
    const member = await findMemberByBarcodeOrCard(supabase, qrRaw);
    if (member) {
      if (policy.require_ticket) {
        const hasTicket = await memberHasTicketForEvent(supabase, eventId, member.email, member.phone);
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
          status: "Already Checked IN",
          member_id: member.id,
          display_name: member.display_name,
          checkin_id: alreadyId,
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

    // B) ticket XCEED (xceed_tickets.qr_code)  ✅ colonne reali
    const { data: ticket, error: tErr } = await supabase
      .from("xceed_tickets")
      .select("id, legacy_person_id, full_name, email, phone")
      .eq("event_id", eventId)
      .eq("qr_code", qrRaw)
      .maybeSingle();

    if (tErr) throw new Error(tErr.message);

    if (ticket?.id) {
      const buyerName = String((ticket as any).full_name ?? "").trim() || "Xceed guest";
      const buyerEmail = normalizeEmail((ticket as any).email ?? null);
      const buyerPhone = normalizePhone((ticket as any).phone ?? null);

      // ✅ CASE 1: evento richiede membership -> check-in ETS unico (member_id)
      if (policy.require_membership) {
        const m = await resolveMemberByEmailOrPhone(supabase, buyerEmail, buyerPhone);

        if (m && (m as any).ambiguous) {
          return NextResponse.json({
            ok: true,
            allowed: false,
            kind: "XCEED",
            status: "denied",
            reason: "ambiguous_member_match",
            display_name: buyerName,
          });
        }

        if (!m) {
          return NextResponse.json({
            ok: true,
            allowed: false,
            kind: "XCEED",
            status: "denied",
            reason: "not_a_member",
            display_name: buyerName,
          });
        }

        const alreadyEtsId = await memberAlreadyCheckedIn(supabase, eventId, (m as any).id);
        if (alreadyEtsId) {
          await supabase.from("xceed_tickets").update({ checkin_id: alreadyEtsId }).eq("id", (ticket as any).id);

          return NextResponse.json({
            ok: true,
            allowed: true,
            kind: "ets_via_xceed",
            status: "Already Checked IN",
            member_id: (m as any).id,
            checkin_id: alreadyEtsId,
            display_name: (m as any).display_name || buyerName,
          });
        }

        const { data: ins, error: insErr } = await supabase
          .from("checkins")
          .insert({
            event_id: eventId,
            member_id: (m as any).id,
            result: "allowed",
            reason: "ets_via_xceed",
            method: "xceed_qr",
            kind: "ETS",
            scanned_code: qrRaw,
          })
          .select("id")
          .maybeSingle();

        if (insErr) throw new Error(insErr.message);

        await supabase.from("xceed_tickets").update({ checkin_id: (ins as any)?.id || null }).eq("id", (ticket as any).id);

        return NextResponse.json({
          ok: true,
          allowed: true,
          kind: "ETS",
          status: "checked_in",
          member_id: (m as any).id,
          checkin_id: (ins as any)?.id || null,
          display_name: (m as any).display_name || buyerName,
        });
      }

      // ✅ CASE 2: evento NON richiede membership -> comportamento XCEED legacy
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
          status: "Already Checked IN",
          legacy_person_id: legacyPersonId,
          display_name: buyerName,
          checkin_id: alreadyId,
        });
      }

      const { data: ins, error: insErr } = await supabase
        .from("checkins")
        .insert({
          event_id: eventId,
          legacy_person_id: legacyPersonId,
          result: "allowed",
          reason: "xceed_ok",
          method: "xceed_qr",
          kind: "XCEED",
          scanned_code: qrRaw,
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);

      await supabase.from("xceed_tickets").update({ checkin_id: (ins as any)?.id || null }).eq("id", (ticket as any).id);

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

    // C) legacy_people barcode numerico => SRL storico
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
            status: "Already Checked IN",
            legacy_person_id: (lp as any).id,
            display_name: (lp as any).full_name ?? null,
            checkin_id: alreadyId,
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

export {};
