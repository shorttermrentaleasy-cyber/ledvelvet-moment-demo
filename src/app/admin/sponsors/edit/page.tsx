// src/app/admin/sponsors/edit/[id]/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminTopbarClient from "../../AdminTopbarClient";

type Sponsor = {
  id: string;
  brand?: string;
  name?: string;
  email?: string;
  status?: string;
  category?: string;
};

export default function AdminSponsorEditPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const [sponsorRes, metaRes] = await Promise.all([
          fetch(`/api/admin/sponsors?id=${id}`),
          fetch(`/api/meta/sponsors`),
        ]);

        if (!sponsorRes.ok) throw new Error("Errore caricamento sponsor");

        const sponsorJson = await sponsorRes.json();
        setSponsor(sponsorJson.data ?? sponsorJson);

      } catch (e: any) {
        setError(e.message || "Errore");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const pageStyle: CSSProperties = { background: "#0B0B0C", color: "#EDEDED", minHeight: "100vh" };
  const cardStyle: CSSProperties = { maxWidth: 980, margin: "0 auto", padding: 20 };
  const panelStyle: CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 18,
  };
  const btn: CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
    textDecoration: "none",
    fontSize: 14,
  };
  const input: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
  };

  return (
    <main style={pageStyle}>
      <AdminTopbarClient backHref="/admin/sponsors" />

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <Link href="/admin/sponsors" style={btn}>← Back</Link>
          <Link href="/" style={btn}>Quit</Link>
        </div>

        <div style={panelStyle}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Edit Sponsor</h1>

          {loading && <p style={{ opacity: 0.7 }}>Caricamento…</p>}
          {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}

          {sponsor && (
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div>
                <label>Brand</label>
                <input style={input} value={sponsor.brand ?? ""} readOnly />
              </div>

              <div>
                <label>Nome</label>
                <input style={input} value={sponsor.name ?? ""} readOnly />
              </div>

              <div>
                <label>Email</label>
                <input style={input} value={sponsor.email ?? ""} readOnly />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
