import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function json(ok: boolean, payload: any, status = 200) {
  return NextResponse.json(
    { ok, ...payload },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function normQ(s: string | null) {
  const t = String(s ?? "").trim();
  return t.length ? t : "";
}

function safeLike(q: string) {
  return `%${q.replace(/%/g, "\\%")}%`;
}

function pickOfferTitle(raw: any) {
  return (
    raw?.offer?.name ??
    raw?.offer?.title ??
    raw?.offer_name ??
    raw?.ticket?.offer?.name ??
    raw?.ticket?.offerTitle ??
    raw?.ticket?.extracted?.offer_title ??
    null
  );
}

function pickOfferDesc(raw: any) {
  return (
    raw?.offer?.description ??
    raw?.offer_description ??
    raw?.ticket?.offer?.description ??
    raw?.ticket?.offerDescription ??
    raw?.ticket?.extracted?.offer_description ??
    null
  );
}

function pickOfferType(raw: any) {
  return (
    raw?.offer?.type ??
    raw?.offer_type ??
    raw?.ticket?.offer?.type ??
    raw?.ticket?.extracted?.offer_type ??
    null
  );
}

function pickOfferTypeLabel(raw: any) {
  const t = pickOfferType(raw);
  if (!t) return null;

  const s = String(t).trim().toLowerCase().replace(/_/g, "-");

  if (s === "guestlist" || s === "guest-list") return "Guest List";
  if (s === "ticket") return "Ticket";

  return s
    .split("-")
    .map((x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : ""))
    .join(" ");
}

function pickTxId(raw: any) {
  return (
    raw?.booking?.bookingId ??
    raw?.booking?.legacyId ??
    raw?.transactionId ??
    raw?.transaction_id ??
    raw?.transaction?.id ??
    null
  );
}

function pickBookingDate(raw: any) {
  return (
    raw?.booking?.purchasedAt ??
    raw?.bookingDate ??
    raw?.booking_date ??
    raw?.createdAt ??
    raw?.created_at ??
    null
  );
}

async function enrichCheckins(supabase: any, rows: any[]) {
  const memberIds = Array.from(new Set(rows.map((c) => c.member_id).filter(Boolean))) as string[];
  const legacyIds = Array.from(new Set(rows.map((c) => c.legacy_person_id).filter(Boolean))) as string[];

  const membersMap = new Map<string, any>();
  const legacyMap = new Map<string, any>();

  if (memberIds.length) {
    const { data: ms, error: msErr } = await supabase
      .from("members")
      .select("id,first_name,last_name,email,phone")
      .in("id", memberIds);

    if (msErr) throw new Error(msErr.message);
    for (const m of ms || []) membersMap.set((m as any).id, m);
  }

  if (legacyIds.length) {
    const { data: ls, error: lsErr } = await supabase
      .from("legacy_people")
      .select("id,full_name,email,phone")
      .in("id", legacyIds);

    if (lsErr) throw new Error(lsErr.message);
    for (const l of ls || []) legacyMap.set((l as any).id, l);
  }

  return rows.map((c) => {
    let display_name: string | null = null;
    let email: string | null = null;
    let phone: string | null = null;

    if (c.member_id && membersMap.has(c.member_id)) {
      const m = membersMap.get(c.member_id);
      display_name = `${String(m.first_name || "").trim()} ${String(m.last_name || "").trim()}`.trim() || null;
      email = m.email ?? null;
      phone = m.phone ?? null;
    } else if (c.legacy_person_id && legacyMap.has(c.legacy_person_id)) {
      const l = legacyMap.get(c.legacy_person_id);
      display_name = l.full_name ?? null;
      email = l.email ?? null;
      phone = l.phone ?? null;
    }

    return {
      id: c.id,
      created_at: c.created_at,
      kind: c.kind || null,
      method: c.method || null,
      result: c.result || null,
      display_name,
      email,
      phone,
      scanned_code: c.scanned_code || null,
    };
  });
}

function hasRealCheckinId(v: unknown) {
  return String(v ?? "").trim().length > 0;
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const event_id = String(searchParams.get("event_id") || "").trim();
    if (!event_id) return json(false, { error: "Missing event_id" }, 400);

    const scope = String(searchParams.get("scope") || "both").trim().toLowerCase(); // tickets|checkins|both
    const q = normQ(searchParams.get("q"));
    const limit = clampInt(searchParams.get("limit"), 100, 1, 500);
    const offset = clampInt(searchParams.get("offset"), 0, 0, 100000);

    const view = String(searchParams.get("view") || "missing").trim().toLowerCase(); // missing|entered|all
    const kind = String(searchParams.get("kind") || "ALL").trim().toUpperCase(); // ALL|ETS|SRL|XCEED

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("id,name,starts_at,require_ticket,require_membership")
      .eq("id", event_id)
      .maybeSingle();

    if (evErr) throw new Error(evErr.message);
    if (!ev) return json(false, { error: "Event not found" }, 404);

    // --------------------------------------------------
    // SUMMARY REALI DA RECORD VERI
    // --------------------------------------------------

    const { data: summaryTicketsRows, error: summaryTicketsErr } = await supabase
      .from("xceed_tickets")
      .select("id,checkin_id")
      .eq("event_id", event_id);

    if (summaryTicketsErr) throw new Error(summaryTicketsErr.message);

    const summaryTickets = summaryTicketsRows || [];
    const tickets_total = summaryTickets.length;
    const tickets_checked_in = summaryTickets.filter((t: any) => hasRealCheckinId(t.checkin_id)).length;
    const tickets_missing = Math.max(0, tickets_total - tickets_checked_in);

    const { data: summaryCheckinsRows, error: summaryCheckinsErr } = await supabase
      .from("checkins")
      .select("id,result,kind")
      .eq("event_id", event_id);

    if (summaryCheckinsErr) throw new Error(summaryCheckinsErr.message);

    const summaryCheckins = summaryCheckinsRows || [];
    const checkins_total = summaryCheckins.length;
    const allowedCheckins = summaryCheckins.filter(
      (c: any) => String(c.result || "").toLowerCase() === "allowed"
    );
    const checkins_allowed = allowedCheckins.length;

    const checkins_allowed_by_kind = {
      ETS: 0,
      XCEED: 0,
      SRL: 0,
      UNKNOWN: 0,
    };

    for (const row of allowedCheckins) {
      const k = String(row.kind || "UNKNOWN").toUpperCase();
      if (k === "ETS") checkins_allowed_by_kind.ETS += 1;
      else if (k === "XCEED") checkins_allowed_by_kind.XCEED += 1;
      else if (k === "SRL") checkins_allowed_by_kind.SRL += 1;
      else checkins_allowed_by_kind.UNKNOWN += 1;
    }

    // --------------------------------------------------
    // TICKETS PAYLOAD - SOLO PAGINA CORRENTE
    // --------------------------------------------------
    let ticketsPayload: any = null;

if (scope === "tickets" || scope === "both") {
  let baseQuery = supabase
    .from("xceed_tickets")
    .select("id,qr_code,full_name,email,phone,checkin_id,imported_at,raw")
    .eq("event_id", event_id)
    .order("imported_at", { ascending: false });

  if (q) {
    const like = safeLike(q);
    baseQuery = baseQuery.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }

  const { data: tickets, error: tErr } = await baseQuery;

  if (tErr) throw new Error(tErr.message);

  const normalizedRows = (tickets || []).map((x: any) => {
    const raw = x.raw || null;
    const normalizedCheckinId = hasRealCheckinId(x.checkin_id) ? String(x.checkin_id).trim() : null;

    return {
      id: x.id,
      qr_code: x.qr_code || null,
      full_name: x.full_name || null,
      email: x.email || null,
      phone: x.phone || null,
      checkin_id: normalizedCheckinId,
      imported_at: x.imported_at || null,
      offer_title: pickOfferTitle(raw),
      offer_description: pickOfferDesc(raw),
      offer_type: pickOfferType(raw),
      offer_type_label: pickOfferTypeLabel(raw),
      transaction_id: pickTxId(raw),
      booking_date: pickBookingDate(raw),
    };
  });

  let filteredRows = normalizedRows;

  if (view === "missing") {
    filteredRows = normalizedRows.filter((t: any) => !hasRealCheckinId(t.checkin_id));
  } else if (view === "entered") {
    filteredRows = normalizedRows.filter((t: any) => hasRealCheckinId(t.checkin_id));
  }

  const tickets_filtered_count = filteredRows.length;
  const rows = filteredRows.slice(offset, offset + limit);
  const has_more = offset + rows.length < tickets_filtered_count;

  ticketsPayload = {
    view,
    q,
    limit,
    offset,
    tickets_filtered_count,
    has_more,
    tickets: rows,
  };
} 







    // --------------------------------------------------
    // CHECKINS PAYLOAD
    // --------------------------------------------------
    let checkinsPayload: any = null;

    if (scope === "checkins" || scope === "both") {
      const { data: lastRaw, error: lastErr } = await supabase
        .from("checkins")
        .select("id,created_at,kind,method,result,member_id,legacy_person_id,scanned_code")
        .eq("event_id", event_id)
        .order("created_at", { ascending: false })
        .range(0, 19);

      if (lastErr) throw new Error(lastErr.message);
      const last20 = await enrichCheckins(supabase, lastRaw || []);

      let cq = supabase
        .from("checkins")
        .select("id,created_at,kind,method,result,member_id,legacy_person_id,scanned_code", { count: "exact" })
        .eq("event_id", event_id)
        .order("created_at", { ascending: false });

      if (kind && kind !== "ALL") cq = cq.eq("kind", kind);

      if (!q) {
        const { data: rawCheckins, error: cErr, count: checkins_filtered_count } = await cq.range(
          offset,
          offset + limit - 1
        );

        if (cErr) throw new Error(cErr.message);

        const enriched = await enrichCheckins(supabase, rawCheckins || []);
        const filteredCount = Number(checkins_filtered_count || 0);
        const has_more = offset + enriched.length < filteredCount;

        checkinsPayload = {
          kind,
          q,
          limit,
          offset,
          has_more,
          checkins_filtered_count: filteredCount,
          checkins: enriched,
          last_checkins: last20,
        };
      } else {
        const maxScan = Math.min(5000, Math.max(offset + limit * 6, 800));
        const { data: rawScan, error: scanErr } = await cq.range(0, maxScan - 1);
        if (scanErr) throw new Error(scanErr.message);

        const enrichedAll = await enrichCheckins(supabase, rawScan || []);
        const qq = q.toLowerCase();

        const filtered = enrichedAll.filter((c: any) => {
          const a = String(c.display_name || "").toLowerCase();
          const b = String(c.email || "").toLowerCase();
          const d = String(c.phone || "").toLowerCase();
          return a.includes(qq) || b.includes(qq) || d.includes(qq);
        });

        const page = filtered.slice(offset, offset + limit);
        const has_more = filtered.length > offset + page.length;

        checkinsPayload = {
          kind,
          q,
          limit,
          offset,
          has_more,
          checkins_filtered_count: filtered.length,
          checkins: page,
          last_checkins: last20,
        };
      }
    }

    return json(true, {
      event: {
        id: ev.id,
        name: ev.name || "",
        starts_at: (ev as any).starts_at || null,
        require_ticket: !!(ev as any).require_ticket,
        require_membership: !!(ev as any).require_membership,
      },
      summary: {
        checkins_total,
        checkins_allowed,
        checkins_allowed_by_kind,

        tickets_total,
        tickets_checked_in,
        tickets_missing,
      },
      ...(ticketsPayload ? { tickets_payload: ticketsPayload } : {}),
      ...(checkinsPayload ? { checkins_payload: checkinsPayload } : {}),
    });
  } catch (e: any) {
    return json(false, { error: e?.message || "Server error" }, 500);
  }
}