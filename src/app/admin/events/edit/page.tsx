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

/* -------------------- FETCH -------------------- */

async function fetchAirtableRecord(recordId: string) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS)
    throw new Error("Missing env");

  const r = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}/${recordId}`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    }
  );

  if (!r.ok) throw new Error("Airtable error");
  return r.json();
}

async function fetchMetaChoices() {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) throw new Error("Missing env");

  const r = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    }
  );

  const data = await r.json();
  const table = data.tables.find((t: any) => t.name === "EVENTS");

  const status =
    table.fields.find((f: any) => f.name === "Status")?.options?.choices?.map(
      (c: any) => c.name
    ) || [];

  const ticketPlatform =
    table.fields.find((f: any) => f.name === "Ticket Platform")?.options
      ?.choices?.map((c: any) => c.name) || [];

  return { status, ticketPlatform };
}

async function fetchSponsors() {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_SPONSOR } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_SPONSOR)
    throw new Error("Missing env");

  const r = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_SPONSOR
    )}?pageSize=100&sort%5B0%5D%5Bfield%5D=Brand%20Name`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    }
  );

  const data = await r.json();
  return (data.records || []).map((r: any) => ({
    id: r.id,
    label: r.fields?.["Brand Name"] || "",
  }));
}

/* -------------------- PAGE -------------------- */

export default async function AdminEditEventPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) unauthorized();

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase());
 	const email = session?.user?.email?.toLowerCase();
	if (!email) unauthorized();
	if (!allowed.includes(email)) unauthorized();


  const id = searchParams.id;
  if (!id) redirect("/admin/events");

  const [record, meta, sponsors] = await Promise.all([
    fetchAirtableRecord(id),
    fetchMetaChoices(),
    fetchSponsors(),
  ]);

  const f = record.fields || {};
  const selectedSponsors: string[] = Array.isArray(f["Sponsors"])
    ? f["Sponsors"]
    : [];

  async function updateAction(formData: FormData) {
    "use server";

    const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_EVENTS } =
      process.env;

    const sponsorsSelected = formData.getAll("sponsors").map(String);

    const fields: Record<string, any> = {
      "Event Name": formData.get("eventName"),
      date: formData.get("date"),
      City: formData.get("city") || undefined,
      Venue: formData.get("venue") || undefined,
      Status: formData.get("status"),
      "Ticket Platform": formData.get("ticketPlatform") || undefined,
      "Ticket Url": formData.get("ticketUrl") || undefined,
      Notes: formData.get("notes") || undefined,
      Sponsors: sponsorsSelected.length ? sponsorsSelected : [],
    };

    const hero = formData.get("heroImageUrl") as string;
    const after = formData.get("aftermovieUrl") as string;

    if (!isHttpUrl(hero) || !isHttpUrl(after))
      redirect(`/admin/events/edit?id=${id}`);

    if (hero) fields["Hero Image"] = [{ url: hero }];
    if (after) fields["Aftermovie"] = [{ url: after }];

    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE_EVENTS!
      )}/${id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    redirect("/admin/events");
  }

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <AdminTopbarClient backHref="/admin/events" />

        <h1 style={styles.h1}>Edit Event</h1>
        <p style={styles.sub}>Record ID: {id}</p>

        <form action={updateAction} style={styles.card}>
          <div style={styles.grid}>
            <Input label="Event name" name="eventName" defaultValue={f["Event Name"]} required />
            <Input label="Date" name="date" defaultValue={f["date"]} required type="date" />
            <Input label="City" name="city" defaultValue={f["City"]} />
            <Input label="Venue" name="venue" defaultValue={f["Venue"]} />

            <Select label="Status" name="status" defaultValue={f["Status"]} options={meta.status} />
            <Select
              label="Ticket Platform"
              name="ticketPlatform"
              defaultValue={f["Ticket Platform"]}
              options={meta.ticketPlatform}
            />

            {/* SPONSORS */}
            <label style={styles.field}>
              <span style={styles.label}>Sponsors</span>
              <select
                name="sponsors"
                multiple
                defaultValue={selectedSponsors}
                style={{ ...styles.input, height: 120 }}
              >
                {sponsors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <Input label="Ticket URL" name="ticketUrl" defaultValue={f["Ticket Url"]} />
            <Input
              label="Hero image URL"
              name="heroImageUrl"
              defaultValue={firstAttachmentUrl(f["Hero Image"])}
            />
            <Input
              label="Aftermovie URL"
              name="aftermovieUrl"
              defaultValue={firstAttachmentUrl(f["Aftermovie"])}
            />

            <Textarea label="Notes" name="notes" defaultValue={f["Notes"]} />
          </div>

          <div style={styles.footer}>
            <button type="submit" style={styles.primaryBtn}>
              Save changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

/* -------------------- small components -------------------- */

function Input({ label, ...props }: any) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input {...props} style={styles.input} />
    </label>
  );
}

function Textarea({ label, ...props }: any) {
  return (
    <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
      <span style={styles.label}>{label}</span>
      <textarea {...props} style={styles.textarea} />
    </label>
  );
}

function Select({ label, options, ...props }: any) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <select {...props} style={styles.input}>
        <option value="">Select</option>
        {options.map((o: string) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/* -------------------- styles -------------------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(255,0,199,0.14), transparent 60%), radial-gradient(1000px 700px at 90% 10%, rgba(0,255,209,0.12), transparent 55%), #070812",
    color: "rgba(255,255,255,0.92)",
  },
  wrap: { maxWidth: 980, margin: "0 auto", padding: "28px 18px 48px" },
  h1: { fontSize: 32, marginBottom: 6 },
  sub: { opacity: 0.65, marginBottom: 18 },
  card: {
    borderRadius: 18,
    padding: 18,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(10px)",
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, opacity: 0.75 },
  input: {
    height: 42,
    borderRadius: 12,
    padding: "0 12px",
    background: "rgba(5,6,14,0.55)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#fff",
    colorScheme: "dark",
  },
  textarea: {
    minHeight: 120,
    borderRadius: 12,
    padding: "10px 12px",
    background: "rgba(5,6,14,0.55)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#fff",
    colorScheme: "dark",
  },
  footer: { display: "flex", justifyContent: "flex-end", marginTop: 16 },
  primaryBtn: {
    padding: "12px 18px",
    borderRadius: 16,
    border: "1px solid rgba(0,255,209,0.75)",
    background:
      "linear-gradient(90deg, rgba(0,255,209,0.35), rgba(255,0,199,0.30))",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
};
