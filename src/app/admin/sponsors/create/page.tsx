"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MetaOption = { id: string; label: string };

// TODO: incolla qui il link del Form/Interface Airtable che mostra SOLO Brand Name + Logo (Attachment)
const AIRTABLE_LOGO_UPLOAD_URL = "https://airtable.com/appkpUBdMSN1oY4TI/pagAsODqmbpUNUtb4";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <div style={styles.label}>{label}</div>
      {children}
    </label>
  );
}

export default function AdminCreateSponsorPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusOptions, setStatusOptions] = useState<MetaOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<MetaOption[]>([]);

  const [form, setForm] = useState({
    brandName: "",
    category: "",
    website: "",
    logoUrl: "",
    email: "",
    phone: "",
    status: "",
    notes: "",
  });

  const canSubmit = useMemo(
    () => !!form.brandName.trim() && !!form.status.trim() && !loading,
    [form.brandName, form.status, loading]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch("/api/meta/sponsors", { cache: "no-store" });
        const data = await r.json();

        if (!alive) return;

        if (!r.ok || !data?.ok) {
          setError(data?.error || "Errore caricamento meta sponsor");
        } else {
          setStatusOptions(Array.isArray(data.status) ? data.status : []);
          setCategoryOptions(Array.isArray(data.category) ? data.category : []);
        }
      } catch {
        if (alive) setError("Errore caricamento meta sponsor");
      } finally {
        if (alive) setLoadingMeta(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/admin/sponsors/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await r.json();

      if (!r.ok || !data?.ok) {
        setError(data?.error || "Errore creazione sponsor");
        return;
      }

      router.replace("/admin/sponsors?refresh=1");
      router.refresh();
    } catch {
      setError("Errore creazione sponsor");
    } finally {
      setLoading(false);
    }
  }

  // Link “intelligente”: se hai brandName compilato, prova a precompilarlo nel Form Airtable.
  // Nota: funziona solo se il campo nel form si chiama esattamente "Brand Name".
  const uploadLogoLink = useMemo(() => {
    if (!AIRTABLE_LOGO_UPLOAD_URL || AIRTABLE_LOGO_UPLOAD_URL.includes("PASTE_")) return AIRTABLE_LOGO_UPLOAD_URL;

    const bn = form.brandName.trim();
    if (!bn) return AIRTABLE_LOGO_UPLOAD_URL;

    const sep = AIRTABLE_LOGO_UPLOAD_URL.includes("?") ? "&" : "?";
    return `${AIRTABLE_LOGO_UPLOAD_URL}${sep}prefill_Brand%20Name=${encodeURIComponent(bn)}`;
  }, [form.brandName]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>Create Sponsor</h1>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.back()} style={styles.secondaryBtn} type="button">
              Back
            </button>
          </div>
        </header>

        {error && <div style={styles.alert}>{error}</div>}

        {/* BLOCCO LOGO: qui rimettiamo “Carica logo” senza toccare API */}
        <div style={styles.logoBox}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={styles.logoTitle}>Logo upload (cliente)</div>
              <div style={styles.logoHelp}>
                Il cliente deve caricare <b>solo il logo</b> nel campo Attachment <b>Logo</b> su Airtable.
                <br />
                Qui sotto trovi il link rapido al Form/Interface Airtable.
              </div>
            </div>

            <a
              href={uploadLogoLink}
              target="_blank"
              rel="noreferrer"
              style={{
                ...styles.primaryBtn,
                opacity: AIRTABLE_LOGO_UPLOAD_URL.includes("PASTE_") ? 0.55 : 1,
                pointerEvents: AIRTABLE_LOGO_UPLOAD_URL.includes("PASTE_") ? "none" : "auto",
              }}
            >
              Carica logo ↗
            </a>
          </div>

          {AIRTABLE_LOGO_UPLOAD_URL.includes("PASTE_") ? (
            <div style={styles.warn}>
              ⚠️ Incolla il link del Form/Interface Airtable in <code>AIRTABLE_LOGO_UPLOAD_URL</code> in questo file.
            </div>
          ) : null}
        </div>

        <form onSubmit={onSubmit} style={styles.card}>
          <div style={styles.grid}>
            <Field label="Brand Name *">
              <input name="brandName" value={form.brandName} onChange={onChange} style={styles.input} required />
            </Field>

            <Field label="Status *">
              <select
                name="status"
                value={form.status}
                onChange={onChange}
                style={styles.input}
                disabled={loadingMeta}
                required
              >
                <option value="">Select</option>
                {statusOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Category">
              <select name="category" value={form.category} onChange={onChange} style={styles.input} disabled={loadingMeta}>
                <option value="">Optional</option>
                {categoryOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Website">
              <input name="website" value={form.website} onChange={onChange} style={styles.input} />
            </Field>

            {/* Logo URL: lo teniamo solo come fallback/legacy (NON è l’upload) */}
            <Field label="Logo URL (optional / legacy)">
              <input name="logoUrl" value={form.logoUrl} onChange={onChange} style={styles.input} placeholder="https://..." />
              <div style={styles.microHelp}>
                Nota: l’upload file vero avviene via Airtable (campo Attachment “Logo”). Qui incolla un URL solo se già disponibile.
              </div>
            </Field>

            <Field label="Email">
              <input name="email" value={form.email} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Phone">
              <input name="phone" value={form.phone} onChange={onChange} style={styles.input} />
            </Field>

            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Notes">
                <textarea name="notes" value={form.notes} onChange={onChange} style={styles.textarea} />
              </Field>
            </div>
          </div>

          <div style={styles.actions}>
            <button type="submit" style={{ ...styles.primaryBtn, opacity: canSubmit ? 1 : 0.6 }} disabled={!canSubmit}>
              {loading ? "Creating…" : "Create"}
            </button>

            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() =>
                setForm({
                  brandName: "",
                  category: "",
                  website: "",
                  logoUrl: "",
                  email: "",
                  phone: "",
                  status: "",
                  notes: "",
                })
              }
            >
              Reset
            </button>
          </div>
        </form>

        <div style={styles.footerNote}>
          Regola: per i loghi, usare Airtable (Attachment “Logo”). La pagina Create/Edit non carica file.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0B0B0C", color: "#EDEDED" },
  wrap: { maxWidth: 980, margin: "0 auto", padding: 20 },
  header: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  kicker: { fontSize: 11, letterSpacing: "0.22em", opacity: 0.65 },
  h1: { margin: "6px 0 0", fontSize: 28, fontWeight: 700 },

  alert: {
    background: "rgba(255, 80, 80, 0.12)",
    border: "1px solid rgba(255, 80, 80, 0.35)",
    color: "#ffb3b3",
    borderRadius: 14,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: 13,
  },

  logoBox: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  logoTitle: { fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85 },
  logoHelp: { marginTop: 6, fontSize: 13, opacity: 0.75, lineHeight: 1.4 },
  warn: {
    marginTop: 10,
    fontSize: 12,
    opacity: 0.85,
    background: "rgba(255,200,80,0.08)",
    border: "1px solid rgba(255,200,80,0.25)",
    borderRadius: 12,
    padding: "8px 10px",
  },

  card: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 18,
  },

  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  field: { display: "block" },
  label: { fontSize: 13, opacity: 0.85, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
    outline: "none",
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
    outline: "none",
    resize: "vertical",
  },
  microHelp: { marginTop: 6, fontSize: 12, opacity: 0.65 },

  actions: { display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#FFFFFF",
    border: "1px solid #FFFFFF",
    color: "#0B0B0C",
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
    fontSize: 14,
    cursor: "pointer",
  },

  footerNote: { marginTop: 14, fontSize: 12, opacity: 0.6 },
};
