import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { checkMemberTicketOnXceed } from "@/lib/member-ticket-xceed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketStatus = {
  status: "purchased" | "not_purchased" | "unavailable";
  offerName: string | null;
};

function getSelectedMemberBarcode(email: string) {
  const value = cookies().get("lv_member_access")?.value || "";
  const separator = value.lastIndexOf(".");
  const secret = process.env.NEXTAUTH_SECRET;
  if (separator < 1 || !secret) return null;

  const barcode = value.slice(0, separator);
  const received = value.slice(separator + 1);
  const expected = createHmac("sha256", secret)
    .update(`${email}:${barcode}`)
    .digest("hex");

  return received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    ? barcode
    : null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) {
    return Response.json({ ok: false, error: "Accesso richiesto." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { eventIds?: unknown } | null;
  const eventIds = Array.from(
    new Set(
      (Array.isArray(body?.eventIds) ? body.eventIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 5);

  if (eventIds.length === 0) {
    return Response.json({ ok: true, statuses: {} });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    return Response.json({ ok: false, error: "Servizio non disponibile." }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: members, error: memberError } = await supabase
    .from("wallyfor_members")
    .select("barcode, email, phone")
    .ilike("email", email)
    .eq("source", "wallyfor_api")
    .eq("is_present", true);

  if (memberError) {
    return Response.json({ ok: false, error: "Impossibile verificare il socio." }, { status: 500 });
  }

  const selectedBarcode = getSelectedMemberBarcode(email);
  const member = members?.length === 1
    ? members[0]
    : members?.find((candidate) => candidate.barcode === selectedBarcode) || null;

  if (!member?.barcode) {
    return Response.json({ ok: false, error: "Scegli prima la tessera." }, { status: 409 });
  }

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, airtable_record_id, xceed_event_ref, xceed_event_uuid")
    .in("airtable_record_id", eventIds);

  if (eventsError) {
    return Response.json({ ok: false, error: "Impossibile verificare gli eventi." }, { status: 500 });
  }

  const statuses: Record<string, TicketStatus> = Object.fromEntries(
    eventIds.map((eventId) => [
      eventId,
      { status: "unavailable", offerName: null } satisfies TicketStatus,
    ])
  );
  const internalEventIds = (events || []).map((event) => event.id).filter(Boolean);
  const purchasedInternalIds = new Set<string>();

  if (internalEventIds.length > 0) {
    const { data: tickets } = await supabase
      .from("xceed_tickets")
      .select("event_id")
      .in("event_id", internalEventIds)
      .eq("member_barcode", member.barcode)
      .neq("status", "cancelled");

    for (const ticket of tickets || []) {
      if (ticket.event_id) purchasedInternalIds.add(String(ticket.event_id));
    }
  }

  await Promise.all(
    (events || []).map(async (event) => {
      const publicEventId = String(event.airtable_record_id || "").trim();
      if (!publicEventId) return;

      if (purchasedInternalIds.has(String(event.id))) {
        statuses[publicEventId] = { status: "purchased", offerName: null };
        return;
      }

      const xceedEventId = String(
        event.xceed_event_uuid || event.xceed_event_ref || ""
      ).trim();
      statuses[publicEventId] = await checkMemberTicketOnXceed({
        xceedEventId,
        barcode: member.barcode,
        email: member.email || "",
        phone: member.phone || "",
      });
    })
  );

  return Response.json(
    { ok: true, statuses },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
