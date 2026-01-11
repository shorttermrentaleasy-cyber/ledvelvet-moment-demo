"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminTopbarClient from "../../../AdminTopbarClient";

type Sponsor = {
  id: string;
  brandName?: string;
  category?: string;
  website?: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
  logoUrl?: string;
};

type MetaPayload = {
  statuses: string[];
  categories: string[];
};

function toLabelArray(x: any): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") return v.label ?? v.name ?? v.value ?? "";
      return "";
    })
    .filter((s) => typeof s === "string" && s.trim().length > 0);
}

function pickMeta(json: any): MetaPayload {
  const empty = { statuses: [], categories: [] };
  if (!json) return empty;

  const root = json.data ?? json;

  const rawStatuses =
    root.statuses ?? root.Statuses ?? root.status ?? root.Status ?? root.statusOptions ?? root.StatusOptions ?? [];
  const rawCategories =
    root.categories ??
    root.Categories ??
    root.category ??
    root.Category ??
    root.categoryOptions ??
    root.CategoryOptions ??
    [];

  return {
    statuses: toLabelArray(rawStatuses),
    categories: toLabelArray(rawCategories),
  };
}

export default function AdminSponsorEditPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [meta, setMeta] = useState<MetaPayload>({ statuses: [], categories: [] });

  const [form, setForm] = useState<Sponsor>({
    id,
    brandName: "",
    category: "",
    website: "",
    email: "",
    phone: "",
    status: "",
    notes: "",
    logoUrl: "",
  });

  const canSubmit = useMemo(
    () => !saving && !deleting && !!form.brandName?.trim(),
    [saving, deleting, form.brandName]
  );

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setOkMsg(null);

        const [sRes, mRes] = await Promise.all([
          fetch(`/api/admin/sponsors/${id}`, { cache: "no-store" }),
          fetch(`/api/meta/sponsors`, { cache: "no-store" }),
        ]);

        const sJson = await sRes.json().catch(() => ({}));
        const mJson = await mRes.json().catch(() => ({}));

        if (!sRes.ok || sJson?.ok === false) throw new Error(sJson?.error || "Errore caricamento sponsor");

        const sponsor: Sponsor = sJson.sponsor ?? sJson.data ?? sJson;

        setForm({
          id: sponsor.id ?? id,
          brandName: sponsor.brandName ?? "",
          category: sponsor.category ?? "",
          website: sponsor.website ?? "",
          email: sponsor.email ?? "",
          phone: sponsor.phone ?? "",
          status: sponsor.status ?? "",
          notes: sponsor.notes ?? "",
          logoUrl: sponsor.logoUrl ?? "",
        });

        setMeta(pickMeta(mJson));
      } catch (e: any) {
        setError(e?.message || "Errore");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSaving(true);
      setError(null);
      setOkMsg(null);

      const payload = {
        brandName: form.brandName || "",
        category: form.category || "",
        website: form.website || "",
        email: form.email || "",
        phone: form.phone || "",
        status: form.status || "",
        notes: form.notes || "",
      };

      const r = await fetch(`/api/admin/sponsors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Errore salvataggio");

      const updated: Sponsor = j.sponsor ?? j.data ?? j;
      setForm((f) => ({
        ...f,
        brandName: updated.brandName ?? f.brandName,
        category: updated.category ?? f.category,
        website: updated.website ?? f.website,
        email: updated.email ?? f.email,
        phone: updated.phone ?? f.phone,
        status: updated.status ?? f.status,
        notes: updated.notes ?? f.notes,
        logoUrl: updated.logoUrl ?? f.logoUrl,
      }));

      setOkMsg("Salvato ✅");
      setTimeout(() => setOkMsg(null), 1500);
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    try {
      setDeleting(true);
      setError(null);
      setOkMsg(null);

      const r = await fetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Errore delete");

      setOkMsg("Eliminato ✅");
      setConfirmDelete(false);

      router.push("/admin/sponsors");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setDeleting(false);
    }
  }

  const pageStyle: CSSProperties = { background: "#0B0B0C", color: "#EDEDED", minHeight: "100vh" };
  const wrap: CSSProperties = { maxWidth: 980, margin: "0 auto", padding: 20 };
  const panel: CSSProperties = {
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
  const btnPrimary: CSSProperties = {
    ...btn,
    background: "#FFFFFF",
    color: "#0B0B0C",
    border: "1px solid #FFFFFF",
    opacity: canSubmit ? 1 : 0.6,
    cursor: canSubmit ? "pointer" : "not-allowed",
  };
  const btnDanger: CSSProperties = {
    ...btn,
    background: "rgba(255, 80, 80, 0.18)",
    border: "1px solid rgba(255, 80, 80, 0.35)",
    color: "#ffb3b3",
  };
  const input: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
    outline: "none",
  };
  const label: CSSProperties = { fontSize: 13, opacity: 0.85, marginBottom: 6, display: "block" };
  const grid: CSSProperties = { marginTop: 16, display: "grid", gap: 12 };

  return (
    <main style={pageStyle}>
      <AdminTopbarClient backHref="/admin/sponsors" />

      <div style={wrap}>
        <div style={panel}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Edit Sponsor</h1>
          <p style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
            ID: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{id}</span>
          </p>

          {loading && <p style={{ opacity: 0.75 }}>Caricamento…</p>}
          {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
          {okMsg && <p style={{ color: "#7CFCB3" }}>{okMsg}</p>}

          {!loading && (
            <form onSubmit={onSubmit} style={grid}>
              {/* LOGO: solo preview + bottoni (niente URL) */}
              <div>
                <label style={label}>Logo (da Airtable)</label>

                {form.logoUrl ? (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        width: "clamp(72px, 14vw, 110px)",
                        height: "clamp(72px, 14vw, 110px)",
                        borderRadius: 12,
                        background: "rgba(0,0,0,0.35)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        display: "grid",
                        placeItems: "center",
                        overflow: "hidden",
                        flex: "0 0 auto",
                      }}
                    >
                      <img
                        src={form.logoUrl}
                        alt="Logo sponsor"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>

    	<div style={{ display: "flex", gap: 8 }}>
  	<a
  href="https://airtable.com/appkpUBdMSN1oY4TI/pagAsODqmbpUNUtb4"
  target="_blank"
  rel="noreferrer"
  style={{
    padding: "6px 10px",
    fontSize: 12,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    textDecoration: "none",
    cursor: "pointer",
  }}
>
  Gestisci il Logo
</a>

	</div>


                  </div>
                ) : (
                  <div style={{ opacity: 0.75, fontSize: 13 }}>
                    Nessun logo caricato in Airtable (campo Attachment “Logo”).
                  </div>
                )}
              </div>

              <div>
                <label style={label}>Brand Name *</label>
                <input
                  style={input}
                  value={form.brandName ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Status</label>
                  <select
                    style={input}
                    value={form.status ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">—</option>
                    {meta.statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Category</label>
                  <select
                    style={input}
                    value={form.category ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    <option value="">—</option>
                    {meta.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={label}>Email</label>
                  <input
                    style={input}
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={label}>Phone</label>
                  <input
                    style={input}
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Website</label>
                <input
                  style={input}
                  value={form.website ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>

              <div>
                <label style={label}>Notes</label>
                <textarea
                  style={{ ...input, minHeight: 90, resize: "vertical" }}
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={btnDanger}
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving || deleting}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/admin/sponsors" style={btn}>
                    ← Back
                  </Link>
                  <button type="submit" style={btnPrimary} disabled={!canSubmit}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.70)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => (deleting ? null : setConfirmDelete(false))}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#141416",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: 18 }}>Confermi eliminazione?</h3>
            <p style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
              Stai per eliminare questo sponsor. Operazione <b>irreversibile</b>.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" style={btn} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Annulla
              </button>
              <button
                type="button"
                style={{ ...btnDanger, background: "rgba(255,80,80,0.28)" }}
                onClick={doDelete}
                disabled={deleting}
              >
                {deleting ? "Elimino…" : "Sì, elimina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
