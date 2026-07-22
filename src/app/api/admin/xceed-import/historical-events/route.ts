import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE_REFS = new Set([
  "182089",
  "187292",
  "192487",
  "194327",
  "202870",
  "238856",
]);
const THETRUM_REF = "204961";

type XceedEvent = {
  id?: number | string | null;
  uuid?: string | null;
  name?: string | null;
  startingTime?: number | null;
  venue?: { name?: string | null } | null;
};

function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeName(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function startsAt(event: XceedEvent) {
  const seconds = Number(event.startingTime);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

async function fetchAllEvents(baseUrl: string, apiKey: string) {
  const all: XceedEvent[] = [];
  const limit = 100;

  for (let offset = 0; ; offset += limit) {
    const response = await fetch(
      `${baseUrl}/v1/events?offset=${offset}&limit=${limit}`,
      {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!response.ok) {
      throw new Error(`Xceed events request failed (${response.status})`);
    }

    const payload = await response.json();
    const page = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];
    all.push(...page);
    if (page.length < limit) break;
  }

  return all;
}

export async function POST() {
  try {
    const apiKey = requiredEnv("XCEED_API_KEY");
    const baseUrl = requiredEnv("XCEED_BASE_URL");
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || requiredEnv("SUPABASE_URL");
    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      requiredEnv("SUPABASE_SERVICE_ROLE");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const xceedEvents = await fetchAllEvents(baseUrl, apiKey);
    const selected = xceedEvents.filter((event) => {
      const ref = String(event.id || "");
      return CREATE_REFS.has(ref) || ref === THETRUM_REF;
    });
    const foundRefs = new Set(selected.map((event) => String(event.id)));
    const requiredRefs = [...CREATE_REFS, THETRUM_REF];
    const missingFromXceed = requiredRefs.filter((ref) => !foundRefs.has(ref));
    if (missingFromXceed.length) {
      return NextResponse.json(
        { ok: false, error: "Required Xceed events not found", missingFromXceed },
        { status: 409 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("events")
      .select("id,name,xceed_event_ref,xceed_event_uuid")
      .in("xceed_event_ref", requiredRefs);
    if (existingError) throw new Error(existingError.message);

    const existingRefs = new Set(
      (existing || []).map((event) => String(event.xceed_event_ref || ""))
    );
    const toCreate = selected
      .filter((event) => CREATE_REFS.has(String(event.id)))
      .filter((event) => !existingRefs.has(String(event.id)))
      .map((event) => ({
        name: String(event.name || "").trim(),
        starts_at: startsAt(event),
        venue: String(event.venue?.name || "").trim() || null,
        city: null,
        xceed_event_ref: String(event.id),
        xceed_event_uuid: String(event.uuid || "").trim() || null,
        require_ticket: true,
        require_membership: true,
        require_active_membership: false,
      }));

    let created: Array<{ id: string; name: string; xceed_event_ref: string }> = [];
    if (toCreate.length) {
      const result = await supabase
        .from("events")
        .insert(toCreate)
        .select("id,name,xceed_event_ref");
      if (result.error) throw new Error(result.error.message);
      created = result.data || [];
    }

    const thetrum = selected.find(
      (event) => String(event.id || "") === THETRUM_REF
    )!;
    let linkedThetrum = false;
    if (!existingRefs.has(THETRUM_REF)) {
      const { data: unlinked, error: unlinkedError } = await supabase
        .from("events")
        .select("id,name,xceed_event_ref")
        .is("xceed_event_ref", null);
      if (unlinkedError) throw new Error(unlinkedError.message);

      const candidates = (unlinked || []).filter((event) => {
        const name = normalizeName(event.name);
        return name.includes("thetrum") || name.includes("shadow on stage");
      });
      if (candidates.length !== 1) {
        return NextResponse.json(
          {
            ok: false,
            error: "Thetrum local event was not resolved uniquely",
            candidates: candidates.map((event) => ({ id: event.id, name: event.name })),
            created,
          },
          { status: 409 }
        );
      }

      const update = await supabase
        .from("events")
        .update({
          xceed_event_ref: THETRUM_REF,
          xceed_event_uuid: String(thetrum.uuid || "").trim() || null,
        })
        .eq("id", candidates[0].id)
        .is("xceed_event_ref", null)
        .select("id")
        .single();
      if (update.error) throw new Error(update.error.message);
      linkedThetrum = true;
    }

    return NextResponse.json({
      ok: true,
      createdCount: created.length,
      created,
      linkedThetrum,
      alreadyPresentCount: requiredRefs.length - created.length - (linkedThetrum ? 1 : 0),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
