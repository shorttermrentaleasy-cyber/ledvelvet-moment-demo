import React from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import AdminTopbarClient from "../AdminTopbarClient";

export const dynamic = "force-dynamic";

type AirtableRec = { id: string; fields: Record<string, any> };
type MetaOption = { id: string; label: string };

function normalizeLower(v: any) {
  return (v ?? "").toString().trim().toLowerCase();
}

function asText(v: any) {
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function asCount(v: any) {
  if (Array.isArray(v)) return v.length;
  if (v == null) return 0;
  return 1;
}

async function fetchSponsorsFromAirtable(): Promise<AirtableRec[]> {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_SPONSOR = process.env.AIRTABLE_TABLE_SPONSOR;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_SPONSOR) {
    throw new Error("Missing Airtable env");
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_SPONSOR
  )}?pageSize=100`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: "no-store",
  });

  const data = await r.json();
  return (data.records || []).map((rec: any) => ({
    id: rec.id,
    fields: rec.fields || {},
  }));
}

async function fetchSponsorMeta(): Promise<{ status: MetaOption[]; category: MetaOption[] }> {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const r = await fetch(`${base}/api/meta/sponsors`, { cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) return { status: [], category: [] };
  return { status: data.status || [], category: data.category || [] };
}

export default async function AdminSponsorsPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; category?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/admin/login");

  const [rows, meta] = await Promise.all([fetchSponsorsFromAirtable(), fetchSponsorMeta()]);

  const sponsors = rows.map((r) => {
    const f = r.fields || {};

    // Airtable fields (come da screenshot)
    const sponsorId = f["SponsorID"] ?? "";
    const brand = f["Brand Name"] ?? "-";
    const category = f["Category"] ?? "";
    const website = f["WebSite"] ?? "";
    const email = f["Email"] ?? "";
    const phone = f["Phone"] ?? "";
    const status = f["Status"] ?? "";
    const notes = f["Notes"] ?? "";
    const logo = f["Logo"] ?? null; // attachment array
    const eventSponsored = f["Event Sponsored"] ?? null; // linked record array (ids)
    const eventName = f["Event Name (from..."] ?? f["Event Name (from Event Sponsored)"] ?? null;

    // logo url (se attachment)
    let logoUrl = "";
    if (Array.isArray(logo) && logo[0]?.url) logoUrl = logo[0].url;

    return {
      id: r.id,
      sponsorId: asText(sponsorId),
      brand: asText(brand),
      category: asText(category),
      status: asText(status),
      email: asText(email),
      phone: asText(phone),
      website: asText(website),
      notes: asText(notes),
      logoUrl,
      eventsCount: asCount(eventSponsored),
      eventNamePreview: Array.isArray(eventName) ? eventName.join(", ") : asText(eventName),
    };
  });

  const q = (searchParams?.q || "").trim();
  const statusFilter = (searchParams?.status || "").trim();
  const categoryFilter = (searchParams?.category || "").trim();

  let filtered = [...sponsors];

  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter((s) =>
      `${s.sponsorId} ${s.brand} ${s.category} ${s.status} ${s.email} ${s.phone} ${s.website} ${s.notes}`
        .toLowerCase()
        .includes(ql)
    );
  }

  if (statusFilter) {
    filtered = filtered.filter((s) => normalizeLower(s.status) === normalizeLower(statusFilter));
  }

  if (categoryFilter) {
    filtered = filtered.filter(
      (s) => normalizeLower(s.category) === normalizeLower(categoryFilter)
    );
  }

  return (
    <main style={pageDark}>
      <AdminTopbarClient backHref="/admin" />

      <div style={headerRow}>
        <h1 style={{ margin: 0 }}>Sponsors</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/admin/sponsors/create" style={createBtn}>
            + Create sponsor
          </a>
        </div>
      </div>

      <form method="GET" style={filterBar}>
        <input name="q" defaultValue={q} placeholder="Search" style={filterInput} />

        <select name="status" defaultValue={statusFilter} style={filterSelect}>
          <option value="">All status</option>
          {meta.status.map((o) => (
            <option key={o.id} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>

        <select name="category" defaultValue={categoryFilter} style={filterSelect}>
          <option value="">All categories</option>
          {meta.category.map((o) => (
            <option key={o.id} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>

        <button type="submit" style={filterBtn}>
          Apply
        </button>

        <a href="/admin/sponsors" style={filterReset}>
          Reset
        </a>
      </form>

      {filtered.length === 0 ? (
        <p style={{ marginTop: 16, opacity: 0.75 }}>Nessuno sponsor trovato.</p>
      ) : (
        <div style={tableWrap}>
          <table style={tableDark}>
            <thead>
              <tr>
                <th style={th}>SponsorID</th>
                <th style={th}>Brand</th>
                <th style={th}>Category</th>
                <th style={th}>Status</th>
                <th style={th}>Email</th>
                <th style={th}>Phone</th>
                <th style={th}>Website</th>
                <th style={th}>Logo</th>
                <th style={th}>Event Sponsored</th>
                <th style={th}>Event Name</th>
                <th style={th}>Notes</th>
                <th style={th}>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{s.sponsorId || "-"}</td>
                  <td style={tdStrong}>{s.brand || "-"}</td>
                  <td style={td}>{s.category || "-"}</td>
                  <td style={td}>{s.status || "-"}</td>
                  <td style={td}>{s.email || "-"}</td>
                  <td style={td}>{s.phone || "-"}</td>
                  <td style={td}>
                    {s.website ? (
                      <a href={s.website} target="_blank" style={link}>
                        link
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={td}>
                    {s.logoUrl ? (
                      <a href={s.logoUrl} target="_blank" style={link}>
                        file
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={td}>{s.eventsCount ? String(s.eventsCount) : "-"}</td>
                  <td style={td}>{s.eventNamePreview || "-"}</td>
                  <td style={tdSmall}>{s.notes ? s.notes : "-"}</td>
                  <td style={td}>
                    <a href={`/admin/sponsors/edit/${s.id}`} style={editBtn}>
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/* ---------- STYLES ---------- */

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
  marginTop: 14,
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
  letterSpacing: 0.2,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
};

const filterBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(10px)",
};

const filterInput: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(5,6,14,0.55)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  minWidth: 220,
  colorScheme: "dark",
};

const filterSelect: React.CSSProperties = {
  ...filterInput,
  minWidth: 180,
};

const filterBtn: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,255,209,0.55)",
  background: "rgba(5,6,14,0.85)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const filterReset: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.22)",
  color: "rgba(255,255,255,0.9)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const tableWrap: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
  marginTop: 16,
  borderRadius: 16,
};

const tableDark: React.CSSProperties = {
  width: "100%",
  minWidth: 1500, // ✅ così vedi TUTTE le colonne senza stringere
  borderCollapse: "collapse",
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  letterSpacing: 1,
  opacity: 0.75,
  padding: "12px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  opacity: 0.88,
  whiteSpace: "nowrap",
};

const tdSmall: React.CSSProperties = {
  ...td,
  whiteSpace: "normal",
  maxWidth: 340,
  lineHeight: 1.35,
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 900,
  opacity: 0.95,
};

const link: React.CSSProperties = {
  color: "rgba(0,255,209,0.9)",
  textDecoration: "none",
  fontWeight: 800,
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
  justifyContent: "center",
  whiteSpace: "nowrap",
};
