import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!allowed.includes(email)) {
    return NextResponse.json({ ok: false, error: "AccessDenied" }, { status: 403 });
  }
  return null;
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Airtable date nel CSV: "1/9/2023" (dd/mm/yyyy o d/m/yyyy).
// La parsiamo in modo deterministico (UTC).

function parseAirtableToISO(input: string | null | undefined): string | null {
  const s = String(input ?? "").trim();
  if (!s) return null;

  // 1) ISO o timestamp già parsabile
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.toISOString();

  // 2) YYYY-MM-DD (senza ora)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [_, y, mo, d] = m;
    // default ore 21:00 locale -> convertiamo a ISO
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), 21, 0, 0);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // 3) YYYY-MM-DD HH:mm(:ss)?
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [_, y, mo, d, hh, mm, ss] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? "0"));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // 4) DD/MM/YYYY (senza ora)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 21, 0, 0);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // 5) DD/MM/YYYY HH:mm(:ss)?
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [_, dd, mm, yyyy, hh, mi, ss] = m;
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss ?? "0"));
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  return null;
}

// Estrazione ref Xceed dal link (MVP robusto):
// - prova a prendere un blocco numerico >= 5 cifre (es. 204961)
// - se non c'è, null
function extractXceedRef(url: string): string | null {
  const s = String(url || "").trim();
  if (!s) return null;

  // prendi la prima sequenza numerica "lunga"
  const m = s.match(/(\d{5,})/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAdmin();
    if (unauthorized) return unauthorized;

    const supabase = supabaseAdmin();
    const body = await req.json();

    const airtable_event_id = String(body?.airtable_event_id || "").trim(); // rec...
    const name = String(body?.name || "").trim();
    const date = String(body?.date || "").trim();
    const city = String(body?.city || "").trim();
    const venue = String(body?.venue || "").trim();
    const ticketPlatform = String(body?.ticketPlatform || "").trim();
    const ticketUrl = String(body?.ticketUrl || "").trim();

    if (!airtable_event_id) {
      return NextResponse.json({ ok: false, error: "Missing airtable_event_id" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
    }

    const isXceed = ticketPlatform.toUpperCase() === "XCEED";

    // Se è XCEED, il ticketUrl è obbligatorio (per derivare xceed_event_ref)
    if (isXceed && !ticketUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing ticketUrl for XCEED event (required to derive xceed_event_ref)",
        },
        { status: 400 }
      );
    }

    // 1) se già linkato -> ritorna UUID (ma SOLO se l'evento supabase ha già xceed refs a posto se XCEED)
    const { data: link, error: linkErr } = await supabase
      .from("event_links")
      .select("airtable_event_id,supabase_event_id")
      .eq("airtable_event_id", airtable_event_id)
      .maybeSingle();

    if (linkErr) throw new Error(linkErr.message);

    if (link?.supabase_event_id) {
      // Se è XCEED, verifichiamo che l'evento supabase abbia xceed_url e xceed_event_ref valorizzati,
      // altrimenti lo consideriamo "non conforme" e blocchiamo (così non ti trovi eventi mezzi rotti).
      if (isXceed) {
        const { data: evCheck, error: evCheckErr } = await supabase
          .from("events")
          .select("id,xceed_url,xceed_event_ref")
          .eq("id", link.supabase_event_id)
          .maybeSingle();

        if (evCheckErr) throw new Error(evCheckErr.message);

        const hasUrl = Boolean(String(evCheck?.xceed_url || "").trim());
        const hasRef = Boolean(String(evCheck?.xceed_event_ref || "").trim());

        if (!hasUrl || !hasRef) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Event link exists but Supabase event is missing xceed_url/xceed_event_ref. Fix the event or re-create mapping.",
              supabase_event_id: link.supabase_event_id,
            },
            { status: 400 }
          );
        }
      }

      return NextResponse.json({
        ok: true,
        airtable_event_id,
        supabase_event_id: link.supabase_event_id,
        reused: true,
      });
    }

    // 2) crea evento su Supabase (campi minimi + operativi)
    const starts_at = parseAirtableToISO(date); // può essere null se non parsabile

    // require_ticket: se XCEED o url contiene xceed (fallback)
    const require_ticket = isXceed || ticketUrl.toLowerCase().includes("xceed");

    // require_membership: default false (lo gestisci poi su Supabase in modo esplicito)
    const require_membership = false;

    // xceed fields
    const xceed_url = ticketUrl || null;
    const xceed_event_ref = xceed_url ? extractXceedRef(xceed_url) : null;

    // Se è XCEED, deve esserci anche un ref estraibile, altrimenti blocchiamo.
    if (isXceed && !xceed_event_ref) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ticketUrl provided but could not extract xceed_event_ref. Provide a valid Xceed URL containing the event ref.",
        },
        { status: 400 }
      );
    }

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .insert({
        name,
        starts_at: starts_at ? starts_at : null,
        venue: venue || null,
        city: city || null,
        xceed_url,
        xceed_event_ref,
        require_ticket,
        require_membership,
      })
      .select("id")
      .maybeSingle();

    if (evErr) throw new Error(evErr.message);
    if (!ev?.id) throw new Error("Failed to create event");

    // 3) salva link airtable -> supabase
    const { error: insLinkErr } = await supabase.from("event_links").insert({
      airtable_event_id,
      supabase_event_id: ev.id,
      airtable_name: name,
    });

    if (insLinkErr) throw new Error(insLinkErr.message);

    return NextResponse.json({
      ok: true,
      airtable_event_id,
      supabase_event_id: ev.id,
      reused: false,
      derived: { require_ticket, require_membership, xceed_event_ref, xceed_url },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
