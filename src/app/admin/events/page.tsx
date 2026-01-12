import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import AdminTopbarClient from "../AdminTopbarClient";
import EventsDeleteButtonClient from "./EventsDeleteButtonClient";
import EventsDuplicateButtonClient from "./EventsDuplicateButtonClient";
import RefreshStampClient from "./RefreshStampClient";

export const dynamic = "force-dynamic";

type AirtableRecord = {
  id: string;
  fields: Record<string, any>;
};

/* ---------------- helpers ---------------- */

function txt(v: any): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
}

function fmtDate(v: any) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return txt(v);
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function eventLabel(f: any, id: string) {
  return f["Event Name"] || f["Event name"] || f.Name || `Event ${id.slice(0, 6)}`;
}

function getEventDateValue(f: any): string {
  // supporta sia "date" che "Date"
  return f?.date || f?.Date || "";
}

function parseDateOnlyISO(v: string): Date | null {
  // accetta YYYY-MM-DD
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

/* ---------------- page ---------------- */

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    city?: string;
    venue?: string;
    ticket?: string;
    dateFrom?: string; // YYYY-MM-DD
    dateTo?: string; // YYYY-MM-DD
  };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/admin/login");

  const {
    AIRTABLE_TOKEN,
    AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_EVENTS,
    AIRTABLE_TABLE_SPONSOR,
  } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
    return (
      <main style={pageDark}>
        <AdminTopbarClient backHref="/admin" />
	<RefreshStampClient />
        <p style={{ marginTop: 20 }}>Missing Airtable env</p>
      </main>
    );
  }

  /* -------- fetch EVENTS -------- */

  const evRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_EVENTS
    )}?pageSize=100`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    }
  );

  const evData = await evRes.json();
  let events: AirtableRecord[] = evData.records || [];

  // ✅ SAFETY: dedupe per ID (evita qualunque doppione)
  {
    const byId = new Map<string, AirtableRecord>();
    for (const r of events) byId.set(r.id, r);
    events = Array.from(byId.values());
  }

  /* -------- fetch SPONSORS -------- */

  let sponsorById: Record<string, string> = {};

  if (AIRTABLE_TABLE_SPONSOR) {
    const spRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        AIRTABLE_TABLE_SPONSOR
      )}?pageSize=100`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        cache: "no-store",
      }
    );

    const spData = await spRes.json();
    (spData.records || []).forEach((s: any) => {
      sponsorById[s.id] = s.fields?.["Brand Name"] || s.fields?.Name || s.id;
    });
  }

  /* -------- build filter options (da events ORIGINALI, non filtrati) -------- */

  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort();

  const statusOpts = uniq(events.map((e) => txt(e.fields?.Status)));
  const cityOpts = uniq(events.map((e) => txt(e.fields?.City)));
  const venueOpts = uniq(events.map((e) => txt(e.fields?.Venue)));
  const ticketOpts = uniq(events.map((e) => txt(e.fields?.["Ticket Platform"])));

  /* -------- filters -------- */

  const q = (searchParams?.q || "").toLowerCase();
  const statusF = searchParams?.status || "";
  const cityF = searchParams?.city || "";
  const venueF = searchParams?.venue || "";
  const ticketF = searchParams?.ticket || "";

  const dateFromStr = searchParams?.dateFrom || "";
  const dateToStr = searchParams?.dateTo || "";
  const dateFrom = parseDateOnlyISO(dateFromStr);
  const dateTo = parseDateOnlyISO(dateToStr);

  // includi dateTo fino a fine giornata
  const dateToEnd = dateTo
    ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999)
    : null;

  // ✅ filtro (SENZA side-effects)
  events = events.filter((e) => {
    const f = e.fields || {};
    const hay = `${eventLabel(f, e.id)} ${txt(f.City)} ${txt(f.Venue)} ${txt(
      f.Status
    )} ${txt(f["Ticket Platform"])}`.toLowerCase();

    if (q && !hay.includes(q)) return false;
    if (statusF && txt(f.Status) !== statusF) return false;
    if (cityF && txt(f.City) !== cityF) return false;
    if (venueF && txt(f.Venue) !== venueF) return false;
    if (ticketF && txt(f["Ticket Platform"]) !== ticketF) return false;

    const rawDate = getEventDateValue(f);
    if (dateFrom || dateToEnd) {
      const d = rawDate ? new Date(rawDate) : null;
      if (!d || isNaN(d.getTime())) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateToEnd && d > dateToEnd) return false;
    }

    return true;
  });

  // ✅ SORT una volta sola, fuori dal filter
  events = [...events].sort((a, b) => {
    const da = new Date(getEventDateValue(a.fields) || 0).getTime();
    const db = new Date(getEventDateValue(b.fields) || 0).getTime();
    return db - da; // più recenti prima
  });

  return (
    <main style={pageDark}>
      <AdminTopbarClient backHref="/admin" />
	<RefreshStampClient />

      <div style={headerRow}>
        <h1 style={{ margin: 0 }}>Events</h1>
        <a href="/admin/events/create" style={createBtn}>
          + Create event
        </a>
      </div>

      {/* -------- FILTER BAR -------- */}
      <form method="GET" style={filterBar}>
        <input name="q" placeholder="Search" defaultValue={searchParams?.q} style={filterInput} />

        <select name="status" defaultValue={statusF} style={filterSelect}>
          <option value="">All status</option>
          {statusOpts.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select name="city" defaultValue={cityF} style={filterSelect}>
          <option value="">All cities</option>
          {cityOpts.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select name="venue" defaultValue={venueF} style={filterSelect}>
          <option value="">All venues</option>
          {venueOpts.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select name="ticket" defaultValue={ticketF} style={filterSelect}>
          <option value="">All ticket platforms</option>
          {ticketOpts.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        {/* DATE RANGE */}
        <input type="date" name="dateFrom" defaultValue={dateFromStr} style={filterInput} title="Date from" />
        <input type="date" name="dateTo" defaultValue={dateToStr} style={filterInput} title="Date to" />

        <button type="submit" style={filterBtn}>
          Apply
        </button>
        <a href="/admin/events" style={filterReset}>
          Reset
        </a>
      </form>

      {/* -------- TABLE -------- */}
      <div style={tableWrap}>
        <table style={tableDark}>
          <thead>
            <tr>
              <th style={th}>Event</th>
              <th style={th}>Featured</th>
              <th style={th}>Date</th>
              <th style={th}>City</th>
              <th style={th}>Venue</th>
              <th style={th}>Status</th>
              <th style={th}>Ticket Platform</th>
              <th style={th}>Sponsors</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const f = e.fields || {};
              const sponsors = Array.isArray(f.Sponsors)
                ? f.Sponsors.map((id: string) => sponsorById[id] || id).join(", ")
                : "-";

              const rawDate = getEventDateValue(f);
              const isFeatured = Boolean(f.Featured);

              return (
                <tr key={e.id}>
                  <td style={tdStrong}>{eventLabel(f, e.id)}</td>

                  <td style={td}>
                    {isFeatured ? <span style={featuredBadge}>FEATURED</span> : ""}
                  </td>

                  <td style={td}>{fmtDate(rawDate)}</td>
                  <td style={td}>{txt(f.City)}</td>
                  <td style={td}>{txt(f.Venue)}</td>
                  <td style={td}>{txt(f.Status)}</td>
                  <td style={td}>{txt(f["Ticket Platform"])}</td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 360 }}>{sponsors}</td>
                  <td style={td}>
                    <a href={`/admin/events/edit?id=${e.id}`} style={editBtn}>
                      Edit
                    </a>
                    <EventsDeleteButtonClient id={e.id} label={eventLabel(f, e.id)} />
                    <EventsDuplicateButtonClient id={e.id} label={eventLabel(f, e.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

/* ---------------- STYLES (Sponsor-style) ---------------- */

const pageDark: React.CSSProperties = {
  minHeight: "100vh",
  padding: "18px 18px 48px",
  color: "rgba(255,255,255,0.92)",
  background:
    "radial-gradient(1200px 600px at 20% -10%, rgba(255,0,199,0.16), transparent 60%), radial-gradient(1000px 700px at 90% 10%, rgba(0,255,209,0.12), transparent 55%), #070812",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const createBtn: React.CSSProperties = {
  height: 44,
  padding: "0 18px",
  borderRadius: 14,
  border: "1px solid rgba(0,255,209,0.9)",
  background: "rgba(0,255,209,0.95)",
  color: "rgba(5,6,14,0.95)",
  fontWeight: 900,
  textDecoration: "none",
};

const filterBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  padding: 12,
  marginBottom: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const filterInput: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 12,
  background: "rgba(5,6,14,0.55)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#fff",
};

const filterSelect: React.CSSProperties = {
  ...filterInput,
  minWidth: 160,
};

const filterBtn: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,255,209,0.55)",
  background: "rgba(5,6,14,0.85)",
  color: "#fff",
  fontWeight: 800,
};

const filterReset: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.22)",
  color: "#fff",
  textDecoration: "none",
};

const tableWrap: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableDark: React.CSSProperties = {
  width: "100%",
  minWidth: 1500,
  borderCollapse: "collapse",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  padding: "12px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "14px 12px", // un filo più aria
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
  fontSize: 16, // ⬅️ chiave
  lineHeight: "1.35",
  color: "rgba(255,255,255,0.82)",
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 500, // normale
  letterSpacing: "0.01em",
  color: "rgba(255,255,255,0.95)",
};

const editBtn: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.22)",
  color: "rgba(255,255,255,0.92)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  marginRight: 6,
};

const featuredBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(147, 11, 12, 0.55)",
  color: "#fff",
};
