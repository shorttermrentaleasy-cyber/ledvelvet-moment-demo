import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import AdminTopbarClient from "../../AdminTopbarClient";

export const dynamic = "force-dynamic";

function unauthorized() {
  redirect("/admin/login");
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
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) redirect(`/admin/events/edit?id=${id}`);

    const sponsorsSelected = formData.getAll("sponsors").map(String);
	const hero = String(formData.get("heroImageUrl") || "").trim();
	const teaser = String(formData.get("teaserUrl") || "").trim();
	const after = String(formData.get("aftermovieUrl") || "").trim();
	// ✅ valida SOLO se non vuoto
	
if ((hero && !isHttpUrl(hero)) || (teaser && !isHttpUrl(teaser)) || (after && !isHttpUrl(after))) {
  	redirect(`/admin/events/edit?id=${id}`);
	}
    
const fields: Record<string, any> = {
      "Event Name": String(formData.get("eventName") || "").trim(),
      date: normalizeDate(formData.get("date")),
      City: String(formData.get("city") || "").trim() || undefined,
      Venue: String(formData.get("venue") || "").trim() || undefined,
      Status: String(formData.get("status") || "").trim() || undefined,
      "Ticket Platform": String(formData.get("ticketPlatform") || "").trim() || undefined,
      "Ticket Url": String(formData.get("ticketUrl") || "").trim() || undefined,
      Notes: String(formData.get("notes") || "").trim() || undefined,
      Sponsors: sponsorsSelected.length ? sponsorsSelected : [],
      Featured: formData.get("featured") === "on",
    };

  	if (hero) fields["Hero Image"] = [{ url: hero }];

	fields["Teaser"] = teaser ? teaser : null;
	fields["Aftermovie"] = after ? after : null;


    const r = await fetch(
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

    if (!r.ok) {
      console.error("Airtable update error:", await r.text());
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

            <Input label="Hero Image URL" name="heroImageUrl" defaultValue={heroImg} />
            <Input label="Teaser URL (YouTube)" name="teaserUrl" defaultValue={teaserUrl} />
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
            <button type="submit" style={styles.primaryBtn}>Save</button>
            <a href="/admin/events" style={styles.secondaryBtn}>Cancel</a>
          </div>
        </form>
      </div>
    </main>
  );
}

/* helpers UI (identici) */
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
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
}

/* styles: invariati */
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

  
  checkRow: { display: "flex", justifyContent: "space-between", padding: 12 },
  details: { borderRadius: 12 },
  summary: { cursor: "pointer", padding: 10 },
  sponsorBox: { maxHeight: 240, overflow: "auto" },
  sponsorItem: { display: "flex", gap: 8 },
  footer: { marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" },
  primaryBtn: { background: "#00ffd5", borderRadius: 12, padding: "0 16px" },
  secondaryBtn: { borderRadius: 12, padding: "0 16px" },
};
