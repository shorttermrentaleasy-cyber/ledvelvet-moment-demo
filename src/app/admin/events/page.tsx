import EventsDuplicateButtonClient from "./EventsDuplicateButtonClient";
import EventsDeleteButtonClient from "./EventsDeleteButtonClient";
import AdminTopbarClient from "../AdminTopbarClient";
import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import EventsToolbarClient from "./EventsToolbarClient";

export const dynamic = "force-dynamic";

type AirtableAttachment = {
  id?: string;
  url: string;
  filename?: string;
};

type AirtableRec = {
  id: string;
  fields: Record<string, any>;
};

function toDateString(v: any): string {
  if (!v) return "-";
  if (typeof v === "string") return v;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(v);
  }
}

function shortText(v: any, max = 60): string {
  const s = (v ?? "").toString().trim();
  if (!s) return "-";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function asUrl(v: any): string | null {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function getAttachmentsCount(v: any): number {
  if (!v) return 0;
  if (Array.isArray(v)) return v.length;
  return 0;
}

function firstAttachmentUrl(v: any): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const first = v[0] as AirtableAttachment;
  return first?.url || null;
}

function normStatus(v: any): string {
  const s = (v ?? "").toString().trim();
  return s || "-";
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const s = status.toLowerCase();

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    fontWeight: 650,
    whiteSpace: "nowrap",
  };

  if (s === "upcoming") {
    return {
      ...base,
      border: "1px solid rgba(0,255,209,0.55)",
      background: "rgba(0,255,209,0.12)",
      boxShadow: "0 0 0 1px rgba(0,255,209,0.18) inset",
    };
  }

  if (s === "past") {
    return {
      ...base,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.82)",
    };
  }

  if (s === "cancelled" || s === "canceled") {
    return {
      ...base,
      border: "1px solid rgba(255,0,120,0.55)",
      background: "rgba(255,0,120,0.10)",
      boxShadow: "0 0 0 1px rgba(255,0,120,0.16) inset",
    };
  }

  return base;
}

function statusDotStyle(status: string): React.CSSProperties {
  const s = status.toLowerCase();

  const base: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(255,255,255,0.55)",
    boxShadow: "0 0 10px rgba(255,255,255,0.18)",
    flex: "0 0 auto",
  };

  if (s === "upcoming") {
    return {
      ...base,
      background: "rgba(0,255,209,0.95)",
      boxShadow: "0 0 14px rgba(0,255,209,0.35)",
    };
  }
  if (s === "past") {
    return {
      ...base,
      background: "rgba(200,200,200,0.75)",
      boxShadow: "0 0 10px rgba(255,255,255,0.12)",
    };
  }
  if (s === "cancelled" || s === "canceled") {
    return {
      ...base,
      background: "rgba(255,0,120,0.95)",
      boxShadow: "0 0 14px rgba(255,0,120,0.35)",
    };
  }

  return base;
}

async function fetchEventsFromAirtable(): Promise<AirtableRec[]> {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
    throw new Error(
      "Missing Airtable env (AIRTABLE_TOKEN / AIRTABLE_BASE_ID / AIRTABLE_TABLE_EVENTS)"
    );
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_EVENTS
  )}?pageSize=100&sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const text = await r.text();

  if (!r.ok) {
    console.error("Airtable events error:", r.status, text);
    throw new Error(`Airtable error ${r.status}`);
  }

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  return (data.records || []).map((rec: any) => ({
    id: rec.id,
    fields: rec.fields,
  }));
}

function normalizeLower(v: any) {
  return (v ?? "").toString().trim().toLowerCase();
}

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    city?: string;
    from?: string;
    to?: string;
    sort?: string;
  };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/admin/login");

  let rows: AirtableRec[] = [];
  let error = "";

  try {
    rows = await fetchEventsFromAirtable();
  } catch (e: any) {
    error = e?.message || "Errore caricamento eventi";
  }

  const mapped = rows.map((r) => {
    const f = r.fields || {};
    const ticketUrl = asUrl(f["Ticket Url"]);
    const hero = f["Hero Image"];
    const aftermovie = f["Aftermovie"];
    const sponsors = f["Sponsors"];

    return {
      id: r.id,
      eventId: f["Event ID"] ?? "-",
      name: f["Event Name"] ?? "-",
      date: toDateString(f["date"] ?? "-"),
      city: f["City"] ?? "-",
      venue: f["Venue"] ?? "-",
      status: f["Status"] ?? "-",
      ticketPlatform: f["Ticket Platform"] ?? "-",
      ticketUrl,
      heroCount: getAttachmentsCount(hero),
      heroFirstUrl: firstAttachmentUrl(hero),
      aftermovieUrl: asUrl(aftermovie) || firstAttachmentUrl(aftermovie),
      aftermovieCount: getAttachmentsCount(aftermovie),
      notes: f["Notes"] ?? "",
      sponsorsCount: Array.isArray(sponsors) ? sponsors.length : 0,
      sponsorsPreview: Array.isArray(sponsors)
        ? sponsors.slice(0, 3).map((x: any) => String(x)).join(", ")
        : "",
    };
  });

  // ---- Filters (server-side via query params)
  const q = (searchParams?.q || "").trim();
  const statusFilter = (searchParams?.status || "").trim();
  const cityFilter = (searchParams?.city || "").trim();
  const from = (searchParams?.from || "").trim();
  const to = (searchParams?.to || "").trim();
  const sort = (searchParams?.sort || "date_desc").trim();

  let filtered = [...mapped];

  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((e) => {
      const hay =
        `${e.name} ${e.city} ${e.venue}`.toLowerCase();
      return hay.includes(ql);
    });
  }

  if (statusFilter) {
    const sf = statusFilter.toLowerCase();
    filtered = filtered.filter((e) => normalizeLower(e.status) === sf);
  }

  if (cityFilter) {
    const cf = cityFilter.toLowerCase();
    filtered = filtered.filter((e) => normalizeLower(e.city).includes(cf));
  }

  if (from && isISODate(from)) {
    filtered = filtered.filter((e) => isISODate(e.date) && e.date >= from);
  }
  if (to && isISODate(to)) {
    filtered = filtered.filter((e) => isISODate(e.date) && e.date <= to);
  }

  if (sort === "date_asc") {
    filtered.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  } else if (sort === "name_asc") {
    filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else {
    // date_desc default
    filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  // Status options from current dataset (unique)
  const statusOptions = Array.from(
    new Set(mapped.map((e) => normStatus(e.status)).filter((s) => s !== "-"))
  ).sort((a, b) => a.localeCompare(b));

  return (
    <main style={pageDark}>
      <h1>Events</h1>
      <p style={{ opacity: 0.75 }}>Logged in as: {session.user?.email}</p>

      <AdminTopbarClient backHref="/admin" />

      {/* toolbar interattiva (client) */}
      <EventsToolbarClient />

      {/* FILTER BAR */}
      <form method="GET" style={filterBar}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search (name / city / venue)"
          style={filterInput}
        />

        <select name="status" defaultValue={statusFilter} style={filterSelect}>
          <option value="">All status</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          name="city"
          defaultValue={cityFilter}
          placeholder="City (contains)"
          style={filterInput}
        />

        <input name="from" defaultValue={from} type="date" style={filterInput} />
        <input name="to" defaultValue={to} type="date" style={filterInput} />

        <select name="sort" defaultValue={sort} style={filterSelect}>
          <option value="date_desc">Sort: date ↓</option>
          <option value="date_asc">Sort: date ↑</option>
          <option value="name_asc">Sort: name A→Z</option>
        </select>

        <button type="submit" style={filterBtn}>
          Apply
        </button>

        <a href="/admin/events" style={filterReset}>
          Reset
        </a>
      </form>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f00" }}>
          {error}
        </div>
      )}

      {!error && filtered.length === 0 ? (
        <p style={{ marginTop: 16 }}>Nessun evento trovato.</p>
      ) : !error ? (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table style={tableDark}>
            <thead>
              <tr>
                <th style={th}>Event ID</th>
                <th style={th}>Event Name</th>
                <th style={th}>Date</th>
                <th style={th}>City</th>
                <th style={th}>Venue</th>
                <th style={th}>Status</th>
                <th style={th}>Ticket Platform</th>
                <th style={th}>Ticket Url</th>
                <th style={th}>Hero Image</th>
                <th style={th}>Aftermovie</th>
                <th style={th}>Notes</th>
                <th style={th}>Sponsors</th>
                <th style={th}>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((e) => {
                const st = normStatus(e.status);
                return (
                  <tr key={e.id}>
                    <td style={tdMono} title={e.id}>
                      {shortText(e.eventId, 28)}
                    </td>

                    <td style={tdStrong}>{e.name}</td>
                    <td style={td}>{isISODate(e.date) ? e.date : "-"}</td>
                    <td style={td}>{e.city}</td>
                    <td style={td}>{e.venue}</td>

                    <td style={td}>
                      {st === "-" ? (
                        "-"
                      ) : (
                        <span style={statusBadgeStyle(st)}>
                          <span style={statusDotStyle(st)} />
                          {st}
                        </span>
                      )}
                    </td>

                    <td style={td}>{e.ticketPlatform}</td>

                    <td style={td}>
                      {e.ticketUrl ? (
                        <a href={e.ticketUrl} target="_blank" rel="noreferrer" style={link}>
                          open
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={td}>
                      {e.heroCount > 0 ? (
                        e.heroFirstUrl ? (
                          <>
                            {e.heroCount} file{" "}
                            <a
                              href={e.heroFirstUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={link}
                            >
                              view
                            </a>
                          </>
                        ) : (
                          `${e.heroCount} file`
                        )
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={td}>
                      {e.aftermovieUrl ? (
                        <a
                          href={e.aftermovieUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={link}
                        >
                          open
                        </a>
                      ) : e.aftermovieCount > 0 ? (
                        `${e.aftermovieCount} file`
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={td} title={String(e.notes || "")}>
                      {shortText(e.notes, 80)}
                    </td>

                    <td style={td} title={e.sponsorsPreview}>
                      {e.sponsorsCount > 0 ? `${e.sponsorsCount}` : "-"}
                    </td>

                    <td style={td}>
                      <a
                        href={`/admin/events/edit?id=${encodeURIComponent(e.id)}`}
                        style={btnGhostSmall}
                      >
                        Edit
                      </a>
			<EventsDeleteButtonClient id={e.id} label={e.name} />
			<EventsDuplicateButtonClient id={e.id} label={e.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
            Nota: "Sponsors" è un campo linked-record: qui mostriamo solo il conteggio (per ora).
          </p>
        </div>
      ) : null}
    </main>
  );
}

const link: React.CSSProperties = {
  color: "rgba(0,255,209,0.92)",
  textDecoration: "none",
  borderBottom: "1px solid rgba(0,255,209,0.25)",
};

const filterBar: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  display: "grid",
  gridTemplateColumns: "1.3fr 0.7fr 0.8fr 0.7fr 0.7fr 0.9fr auto auto",
  gap: 10,
  alignItems: "center",
};

const filterInput: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  outline: "none",
  background: "rgba(5,6,14,0.55)",
  color: "rgba(255,255,255,0.92)",
  colorScheme: "dark",
};

const filterSelect: React.CSSProperties = {
  ...filterInput,
  padding: "0 10px",
};

const filterBtn: React.CSSProperties = {
  height: 42,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,255,209,0.55)",
  background: "rgba(0,255,209,0.12)",
  color: "rgba(255,255,255,0.95)",
  fontWeight: 700,
  cursor: "pointer",
};

const filterReset: React.CSSProperties = {
  height: 42,
  padding: "0 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(0,0,0,0.22)",
  color: "rgba(255,255,255,0.9)",
  textDecoration: "none",
  fontWeight: 650,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  whiteSpace: "nowrap",
  fontSize: 13,
  opacity: 0.75,
};

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  verticalAlign: "top",
  fontSize: 14,
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 600,
};

const pageDark: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  color: "rgba(255,255,255,0.92)",
  background:
    "radial-gradient(1200px 600px at 20% -10%, rgba(255,0,199,0.12), transparent 60%), radial-gradient(1000px 700px at 90% 10%, rgba(0,255,209,0.10), transparent 55%), #070812",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};


const tableDark: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 14,
  overflow: "hidden",
};

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  opacity: 0.85,
};

const btnGhostSmall: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(0,0,0,0.35)",
  color: "rgba(255,255,255,0.9)",
  textDecoration: "none",
  fontSize: 12,
};
