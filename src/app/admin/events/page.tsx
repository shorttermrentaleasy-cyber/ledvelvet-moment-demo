import EventsDuplicateButtonClient from "./EventsDuplicateButtonClient";
import EventsDeleteButtonClient from "./EventsDeleteButtonClient";
import AdminTopbarClient from "../AdminTopbarClient";
import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import EventsToolbarClient from "./EventsToolbarClient";
import { headers } from "next/headers";

type AirtableRecord = {
  id: string;
  fields: Record<string, any>;
};

function normStr(v: any): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function isValidISODate(value: string) {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function fmtDate(value: any) {
  const s = normStr(value);
  if (!s) return "";
  if (isValidISODate(s)) {
    try {
      return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(
        new Date(s)
      );
    } catch {
      return s;
    }
  }
  return s;
}

function getEventLabel(fields: Record<string, any>, id: string) {
  const label =
    normStr(fields["Event name"]) ||
    normStr(fields["Event Name"]) ||
    normStr(fields.Name) ||
    normStr(fields.name);
  return label || `Event ${id.slice(0, 6)}`;
}

function getOriginFromHeaders() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/admin/login?callbackUrl=/admin/events");
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_EVENTS = process.env.AIRTABLE_TABLE_EVENTS;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_EVENTS) {
    return (
      <div style={wrap}>
        <AdminTopbarClient />
        <h1 style={h1}>Events</h1>
        <p style={errorBox}>
          Missing env vars: AIRTABLE_TOKEN / AIRTABLE_BASE_ID /
          AIRTABLE_TABLE_EVENTS
        </p>
      </div>
    );
  }

  const qs = new URLSearchParams();
  const q = (searchParams?.q as string) || "";
  const status = (searchParams?.status as string) || "";
  const city = (searchParams?.city as string) || "";
  const from = (searchParams?.from as string) || "";
  const to = (searchParams?.to as string) || "";
  const sort = (searchParams?.sort as string) || "date_desc";

  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (city) qs.set("city", city);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (sort) qs.set("sort", sort);

  const apiPath = `/api/admin/events${qs.toString() ? `?${qs}` : ""}`;

  let records: AirtableRecord[] = [];
  let error: string | null = null;

  try {
    const origin = getOriginFromHeaders();
    const res = await fetch(`${origin}${apiPath}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      error = `Airtable error ${res.status}`;
      if (json?.error) error += `: ${json.error}`;
    } else {
      records = Array.isArray(json?.records) ? json.records : [];
    }
  } catch (e: any) {
    error = `Fetch failed: ${e?.message || "unknown error"}`;
  }

  return (
    <div style={wrap}>
      <AdminTopbarClient />

      <div style={topRow}>
        <div>
          <h1 style={h1}>Events</h1>
          <p style={subtle}>
            Logged in as: <b>{session.user.email}</b>
          </p>
        </div>

        <div style={rightTop}>
          <a href="/admin" style={btnGhost}>
            ← Back
          </a>
          <a href="/admin/events/create" style={btnPrimary}>
            + Create event
          </a>
        </div>
      </div>

      <EventsToolbarClient />

      {error ? (
        <p style={errorBox}>{error}</p>
      ) : records.length === 0 ? (
        <p style={subtle}>Nessun evento trovato.</p>
      ) : (
        <div
          style={{
            marginTop: 16,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <table style={tableDark}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Date</th>
                <th style={th}>City</th>
                <th style={th}>Venue</th>
                <th style={th}>Status</th>
                <th style={th}>Ticket Platform</th>
                <th style={th}>Ticket URL</th>
                <th style={th}>Sponsors</th>
                <th style={th}>Record ID</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((e) => {
                const f = e.fields || {};
                const label = getEventLabel(f, e.id);

                const sponsors = Array.isArray(f.Sponsors)
                  ? f.Sponsors.join(", ")
                  : normStr(f.Sponsors);

                return (
                  <tr key={e.id}>
                    <td style={td}>
                      <b>{label}</b>
                    </td>
                    <td style={td}>{fmtDate(f.Date || f.date)}</td>
                    <td style={td}>{normStr(f.City || f.city)}</td>
                    <td style={td}>{normStr(f.Venue || f.venue)}</td>
                    <td style={td}>{normStr(f.Status || f.status)}</td>
                    <td style={td}>
                      {normStr(f["Ticket Platform"] || f.TicketPlatform)}
                    </td>
                    <td style={td}>
                      {f["Ticket URL"] || f.TicketURL ? (
                        <a
                          href={normStr(f["Ticket URL"] || f.TicketURL)}
                          target="_blank"
                          rel="noreferrer"
                          style={link}
                        >
                          open ↗
                        </a>
                      ) : (
                        <span style={{ opacity: 0.6 }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      {sponsors || <span style={{ opacity: 0.6 }}>—</span>}
                    </td>
                    <td style={tdMono}>{e.id}</td>

                    <td
                      style={{
                        ...td,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <a
                        href={`/admin/events/edit?id=${encodeURIComponent(e.id)}`}
                        style={btnGhostSmall}
                      >
                        Edit
                      </a>
                      <EventsDeleteButtonClient id={e.id} label={label} />
                      <EventsDuplicateButtonClient id={e.id} label={label} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
            Su mobile puoi scorrere orizzontalmente la tabella.
          </p>
        </div>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  padding: 24,
  color: "rgba(255,255,255,0.92)",
};

const topRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const rightTop: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const h1: React.CSSProperties = {
  fontSize: 34,
  margin: "0 0 4px 0",
};

const subtle: React.CSSProperties = {
  opacity: 0.75,
  margin: 0,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255, 60, 80, 0.55)",
  background: "rgba(255, 60, 80, 0.10)",
  color: "rgba(255,255,255,0.95)",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 14,
  background: "linear-gradient(90deg, #00d4ff, #a855f7)",
  color: "#0b0b10",
  textDecoration: "none",
  fontWeight: 700,
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(0,0,0,0.25)",
  color: "rgba(255,255,255,0.92)",
  textDecoration: "none",
};

const link: React.CSSProperties = {
  color: "#7dd3fc",
  textDecoration: "none",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 12px",
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.75)",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.02)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const tableDark: React.CSSProperties = {
  width: "100%",
  minWidth: 1200,
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
