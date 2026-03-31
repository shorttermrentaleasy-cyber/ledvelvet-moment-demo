import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import AdminTopbarClient from "../../AdminTopbarClient";

const HERO_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/16wk3mKNNsjg3idhix5pygKP6lMHZ_S5O";
const YT_STUDIO_VIDEOS_URL = "https://studio.youtube.com/channel/UCfQf25gurELioXHUNN8fSNQ/videos/";

export const dynamic = "force-dynamic";

function unauthorized() {
  redirect("/admin/login");
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeDriveImageUrl(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";

  if (s.includes("drive.google.com/uc?") && s.includes("id=")) return s;

  const m1 = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;

  const m2 = s.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1]) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;

  const m3 = s.match(/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if (m3?.[1]) return `https://drive.google.com/uc?export=view&id=${m3[1]}`;

  return s;
}

function isHttpUrl(v: string) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function firstAttachmentUrl(v: any): string {
  if (!Array.isArray(v) || v.length === 0) return "";
  return v[0]?.url || "";
}

function normalizeDate(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toStartsAt(input: string): string | null {
  const s = String(input || "").trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type ParsedXceedPublicUrl = {
  isXceed: boolean;
  xceedUrl: string | null;
  legacyId: number | null;
  channel: string | null;
};

function parseXceedPublicUrl(input: string): ParsedXceedPublicUrl {
  const raw = String(input || "").trim();
  if (!raw) {
    return {
      isXceed: false,
      xceedUrl: null,
      legacyId: null,
      channel: null,
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      isXceed: false,
      xceedUrl: raw,
      legacyId: null,
      channel: null,
    };
  }

  const host = url.hostname.toLowerCase();
  const isProdXceed = host === "xceed.me" || host.endsWith(".xceed.me");
  if (!isProdXceed) {
    return {
      isXceed: false,
      xceedUrl: raw,
      legacyId: null,
      channel: null,
    };
  }

  const parts = url.pathname.split("/").filter(Boolean);

  let legacyId: number | null = null;
  let channel: string | null = null;

  const channelIdx = parts.findIndex((p) => p.toLowerCase() === "channel");
  if (channelIdx >= 0 && parts[channelIdx + 1]) {
    channel = parts[channelIdx + 1].trim() || null;
  }

  const eventIdx = parts.findIndex((p) => p.toLowerCase() === "event");
  if (eventIdx >= 0) {
    for (let i = eventIdx + 1; i < parts.length; i++) {
      if (/^\d+$/.test(parts[i])) {
        const n = Number(parts[i]);
        if (Number.isInteger(n) && n > 0) {
          legacyId = n;
          break;
        }
      }
    }
  }

  return {
    isXceed: true,
    xceedUrl: raw,
    legacyId,
    channel,
  };
}

type XceedEventFetchResult = {
  ok: boolean;
  legacyId: number | null;
  eventUuid: string | null;
  name: string | null;
  startsAt: string | null;
  venue: string | null;
  city: string | null;
};

async function fetchXceedEventByLegacyId(
  legacyId: number,
  channel: string | null
): Promise<XceedEventFetchResult> {
  const qp = new URLSearchParams();
  if (channel) qp.set("channel", channel);

  const url = `https://events.xceed.me/v1/events/${legacyId}${qp.toString() ? `?${qp.toString()}` : ""}`;

  const r = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!r.ok) {
    return {
      ok: false,
      legacyId,
      eventUuid: null,
      name: null,
      startsAt: null,
      venue: null,
      city: null,
    };
  }

  const j = await r.json().catch(() => null);
  const data = j?.data;

  const startingTime =
    typeof data?.startingTime === "number" && Number.isFinite(data.startingTime)
      ? new Date(data.startingTime * 1000).toISOString()
      : null;

  return {
    ok: Boolean(j?.success && data),
    legacyId: typeof data?.legacyId === "number" ? data.legacyId : legacyId,
    eventUuid: typeof data?.id === "string" ? data.id : null,
    name: typeof data?.name === "string" ? data.name.trim() : null,
    startsAt: startingTime,
    venue: typeof data?.venue?.name === "string" ? data.venue.name.trim() : null,
    city: typeof data?.venue?.city?.name === "string" ? data.venue.city.name.trim() : null,
  };
}

type SponsorOption = { id: string; label: string };

async function fetchAirtableRecord(recordId: string) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
    throw new Error("Missing env");
  }

  const r = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}/${recordId}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, cache: "no-store" }
  );

  if (!r.ok) throw new Error("Airtable error");
  return r.json();
}

async function fetchMetaChoices(): Promise<{ status: string[]; ticketPlatform: string[] }> {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) throw new Error("Missing env");

  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const data = await r.json();
  const table = (data.tables || []).find((t: any) => t.name === AIRTABLE_TABLE_EVENTS);

  const status =
    table?.fields?.find((f: any) => f.name === "Status")?.options?.choices?.map((c: any) => c.name) || [];

  const ticketPlatform =
    table?.fields
      ?.find((f: any) => f.name === "Ticket Platform")
      ?.options?.choices?.map((c: any) => c.name) || [];

  return { status, ticketPlatform };
}

async function fetchSponsors(): Promise<SponsorOption[]> {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_SPONSOR } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_SPONSOR) throw new Error("Missing env");

  const r = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_SPONSOR
    )}?pageSize=100&sort%5B0%5D%5Bfield%5D=Brand%20Name`,
    { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, cache: "no-store" }
  );

  const data = await r.json();

  return (data.records || []).map((rec: any) => ({
    id: rec.id,
    label: rec.fields?.["Brand Name"] || rec.fields?.Brand || rec.fields?.Company || rec.id,
  }));
}

async function fetchExistingFeatured(excludeId: string) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) return null;

  const filter = encodeURIComponent("Featured = TRUE()");
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_EVENTS
  )}?pageSize=20&filterByFormula=${filter}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  if (!r.ok) return null;
  const data = await r.json();
  const records = data.records || [];
  const other = records.find((x: any) => x.id !== excludeId);
  if (!other) return null;
  return { id: other.id, name: other.fields?.["Event Name"] || other.id };
}

export default async function AdminEditEventPage({ searchParams }: { searchParams: { id?: string } }) {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) unauthorized();

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) unauthorized();

  const id = searchParams.id;
  if (!id) redirect("/admin/events");

  const [record, meta, sponsors, existingFeatured] = await Promise.all([
    fetchAirtableRecord(id),
    fetchMetaChoices(),
    fetchSponsors(),
    fetchExistingFeatured(id),
  ]);

  const f = record.fields || {};
  const selectedSponsors: string[] = Array.isArray(f["Sponsors"]) ? f["Sponsors"] : [];

  const heroImg = firstAttachmentUrl(f["Hero Image"]);
  const teaserUrl = String(f["Teaser"] || "").trim();
  const aftermovieUrl = String(f["Aftermovie"] || "").trim();

  async function updateAction(formData: FormData) {
    "use server";

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
      redirect(`/admin/events/edit?id=${id}`);
    }

    const sponsorsSelected = formData.getAll("sponsors").map(String);
    const heroRaw = String(formData.get("heroImageUrl") || "").trim();
    const hero = normalizeDriveImageUrl(heroRaw);
    const teaser = String(formData.get("teaserUrl") || "").trim();
    const after = String(formData.get("aftermovieUrl") || "").trim();

    if ((hero && !isHttpUrl(hero)) || (teaser && !isHttpUrl(teaser)) || (after && !isHttpUrl(after))) {
      redirect(`/admin/events/edit?id=${id}`);
    }

    const eventName = String(formData.get("eventName") || "").trim();
    const date = normalizeDate(formData.get("date"));
    const ticketPlatform = String(formData.get("ticketPlatform") || "").trim();
    const ticketUrl = String(formData.get("ticketUrl") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const venue = String(formData.get("venue") || "").trim();
    const status = String(formData.get("status") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const requireTicket = formData.get("requireTicket") === "on";
    const requireMembership = formData.get("requireMembership") === "on";
    const requireActiveMembership = formData.get("requireActiveMembership") === "on";

    const fields: Record<string, any> = {
      "Event Name": eventName,
      date,
      City: city || null,
      Venue: venue || null,
      Status: status || null,
      "Ticket Platform": ticketPlatform || null,
      "Ticket Url": ticketUrl || null,
      Notes: notes || null,
      Sponsors: sponsorsSelected.length ? sponsorsSelected : [],
      Featured: formData.get("featured") === "on",
    };

    if (hero) fields["Hero Image"] = [{ url: hero }];
    if (!hero) fields["Hero Image"] = null;
    fields["Teaser"] = teaser ? teaser : null;
    fields["Aftermovie"] = after ? after : null;

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_EVENTS)}/${id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!airtableRes.ok) {
      console.error("Airtable update error:", await airtableRes.text());
      redirect(`/admin/events/edit?id=${id}`);
    }

    // ---- sync minima verso Supabase events ----
    const parsedXceed = parseXceedPublicUrl(ticketUrl);

    let xceedEventRef: number | null = null;
    let xceedEventUuid: string | null = null;

    let finalName = eventName;
    let finalStartsAt = toStartsAt(date);
    let finalVenue = venue || null;
    let finalCity = city || null;
    let finalXceedUrl = parsedXceed.isXceed ? parsedXceed.xceedUrl : null;

    if (parsedXceed.isXceed && parsedXceed.legacyId) {
      const xceedData = await fetchXceedEventByLegacyId(parsedXceed.legacyId, parsedXceed.channel);

      xceedEventRef = xceedData.legacyId;
      xceedEventUuid = xceedData.eventUuid;
    }

    const supabase = supabaseAdmin();

const updatePayload = {
  name: finalName,
  starts_at: finalStartsAt,
  venue: finalVenue,
  city: finalCity,
  xceed_url: finalXceedUrl,
  xceed_event_ref: xceedEventRef ? String(xceedEventRef) : null,
  xceed_event_uuid: xceedEventUuid,
  require_ticket: requireTicket,
  require_membership: requireMembership,
  require_active_membership: requireActiveMembership,
};

    const { error: supabaseError } = await supabase
      .from("events")
      .update(updatePayload)
      .eq("airtable_record_id", id);

    if (supabaseError) {
      console.error("Supabase events update failed:", {
        message: supabaseError.message,
        details: (supabaseError as any).details,
        hint: (supabaseError as any).hint,
        code: (supabaseError as any).code,
        airtableRecordId: id,
        updatePayload,
      });

      redirect(`/admin/events/edit?id=${id}`);
    }

    redirect("/admin/events?refresh=1");
  }

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <AdminTopbarClient backHref="/admin/events" />
        <h1 style={styles.h1}>Edit Event</h1>
        <p style={styles.sub}>Record ID: {id}</p>

        {existingFeatured && (
          <div style={styles.warn}>
            <b>WARNING FEATURED</b>
            <div style={{ marginTop: 6 }}>
              Esiste già un altro evento FEATURED: <b>{existingFeatured.name}</b>
            </div>
          </div>
        )}

        <form action={updateAction} style={styles.card}>
          <div style={styles.grid}>
            <Input label="Event name" name="eventName" defaultValue={f["Event Name"]} required />
            <Input label="Date" name="date" defaultValue={normalizeDate(f["date"])} type="date" />
            <Input label="City" name="city" defaultValue={f["City"]} />
            <Input label="Venue" name="venue" defaultValue={f["Venue"]} />

            <Select label="Status" name="status" defaultValue={String(f["Status"] || "")} options={meta.status} />
            <Select
              label="Ticket Platform"
              name="ticketPlatform"
              defaultValue={String(f["Ticket Platform"] || "")}
              options={meta.ticketPlatform}
            />

            <Input label="Ticket URL" name="ticketUrl" defaultValue={f["Ticket Url"]} />

            <Field label="Hero Google Drive URL (o direct image URL)">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input name="heroImageUrl" defaultValue={heroImg} style={{ ...styles.input, flex: 1 }} />
                <a
                  href={HERO_DRIVE_FOLDER_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.driveBtn}
                  title="Apri la cartella Drive dove caricare le immagini Hero"
                >
                  Apri Drive
                </a>
              </div>
            </Field>

            <Field label="Teaser URL (YouTube)">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input name="teaserUrl" defaultValue={teaserUrl} style={{ ...styles.input, flex: 1 }} />
                <a
                  href={YT_STUDIO_VIDEOS_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.ytBtn}
                  title="Apri YouTube Studio per caricare o gestire i video"
                >
                  YouTube Studio
                </a>
              </div>
            </Field>

            <Input label="Aftermovie URL (YouTube)" name="aftermovieUrl" defaultValue={aftermovieUrl} />

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.checkRow}>
                <div>
                  <div style={styles.label}>Featured</div>
                  <div style={styles.smallMuted}>Evento in evidenza</div>
                </div>
                <input type="checkbox" name="featured" defaultChecked={Boolean(f["Featured"])} />
              </label>
            </div>

<div style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}>
  <label style={styles.checkRow}>
    <div>
      <div style={styles.label}>Require ticket</div>
      <div style={styles.smallMuted}>Richiede biglietto valido</div>
    </div>
    <input
      type="checkbox"
      name="requireTicket"
      defaultChecked={Boolean((f as any)["Require Ticket"] ?? true)}
    />
  </label>

  <label style={styles.checkRow}>
    <div>
      <div style={styles.label}>Require membership</div>
      <div style={styles.smallMuted}>Richiede tessera/socio</div>
    </div>
    <input
      type="checkbox"
      name="requireMembership"
      defaultChecked={Boolean((f as any)["Require Membership"] ?? true)}
    />
  </label>

  <label style={styles.checkRow}>
    <div>
      <div style={styles.label}>Require active membership</div>
      <div style={styles.smallMuted}>Controlla anche stato attivo tessera</div>
    </div>
    <input
      type="checkbox"
      name="requireActiveMembership"
      defaultChecked={Boolean((f as any)["Require Active Membership"] ?? false)}
    />
  </label>
</div>



            <div style={{ gridColumn: "1 / -1" }}>
              <SponsorsPicker sponsors={sponsors} defaultSelected={selectedSponsors} />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Notes">
                <textarea name="notes" defaultValue={f["Notes"]} style={styles.textarea} />
              </Field>
            </div>
          </div>

          <div style={styles.footer}>
            <button type="submit" style={styles.primaryBtn}>
              Save
            </button>
            <a href="/admin/events" style={styles.secondaryBtn}>
              Cancel
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}

function SponsorsPicker({ sponsors, defaultSelected }: { sponsors: SponsorOption[]; defaultSelected: string[] }) {
  const selectedCount = defaultSelected?.length || 0;
  return (
    <Field label="Sponsors (multiple)">
      <details style={styles.details}>
        <summary style={styles.summary}>
          <span>{selectedCount ? `Selected: ${selectedCount}` : "Select sponsors"}</span>
          <span style={{ opacity: 0.7 }}>▼</span>
        </summary>
        <div style={styles.sponsorBox}>
          {sponsors.map((s) => (
            <label key={s.id} style={styles.sponsorItem}>
              <input type="checkbox" name="sponsors" value={s.id} defaultChecked={defaultSelected.includes(s.id)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </details>
    </Field>
  );
}

function Field({ label, children }: any) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function Input({ label, ...rest }: any) {
  return (
    <Field label={label}>
      <input {...rest} style={styles.input} />
    </Field>
  );
}

function Select({ label, name, defaultValue, options }: any) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={defaultValue} style={styles.input}>
        <option value="">—</option>
        {options.map((o: string) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#070812", color: "#fff" },
  wrap: { maxWidth: 860, margin: "0 auto", padding: 16 },
  h1: { margin: 0, fontSize: 26, fontWeight: 800 },
  sub: { marginTop: 6, fontSize: 12, opacity: 0.65 },
  warn: { marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,0,0,0.10)" },
  card: { marginTop: 16, padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.05)" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, opacity: 0.8 },
  smallMuted: { fontSize: 11, opacity: 0.6 },

  input: {
    height: 40,
    borderRadius: 10,
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "0 12px",
    outline: "none",
    colorScheme: "dark",
  },

  textarea: {
    minHeight: 110,
    borderRadius: 10,
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "10px 12px",
    outline: "none",
  },

  driveBtn: {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,255,209,0.55)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
  },

  ytBtn: {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
  },

  checkRow: { display: "flex", justifyContent: "space-between", padding: 12 },
  details: { borderRadius: 12 },
  summary: { cursor: "pointer", padding: 10 },
  sponsorBox: { maxHeight: 240, overflow: "auto" },
  sponsorItem: { display: "flex", gap: 8 },
  footer: { marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" },
  primaryBtn: { background: "#00ffd5", borderRadius: 12, padding: "0 16px" },
  secondaryBtn: { borderRadius: 12, padding: "0 16px" },
};