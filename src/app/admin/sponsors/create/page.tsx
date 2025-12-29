"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MetaOption = { id: string; label: string };

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
    [form, loading]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch("/api/meta/sponsors", { cache: "no-store" });
        const data = await r.json();

        if (!alive) return;

        if (!r.ok || !data.ok) {
          setError(data.error || "Errore caricamento meta sponsor");
        } else {
          setStatusOptions(data.status || []);
          setCategoryOptions(data.category || []);
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

  function onChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    const r = await fetch("/api/admin/sponsors/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await r.json();
    setLoading(false);

    if (!r.ok || !data.ok) {
      setError(data.error || "Errore creazione sponsor");
      return;
    }

    router.replace("/admin/sponsors?refresh=1");
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>Create Sponsor</h1>
          </div>
          <button onClick={() => router.back()} style={styles.secondaryBtn}>
            Back
          </button>
        </header>

        {error && <div style={styles.alert}>{error}</div>}

        <form onSubmit={onSubmit} style={styles.card}>
          <div style={styles.grid}>
            <Field label="Brand Name *">
              <input
                name="brandName"
                value={form.brandName}
                onChange={onChange}
                style={styles.input}
                required
              />
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
              <select
                name="category"
                value={form.category}
                onChange={onChange}
                style={styles.input}
                disabled={loadingMeta}
              >
                <option value="">Optional</option>
                {categoryOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Website">
              <input
                name="website"
                value={form.website}
                onChange={onChange}
                style={styles.input}
              />
            </Field>

            <Field label="Logo URL">
              <input
                name="logoUrl"
                value={form.logoUrl}
                onChange={onChange}
                style={styles.input}
              />
            </Field>

            <Field label="Email">
              <input
                name="email"
                value={form.email}
                onChange={onChange}
                style={styles.input}
              />
            </Field>

            <Field label="Phone">
              <input
                name="phone"
                value={form.phone}
                onChange={onChange}
                style={styles.input}
              />
            </Field>

            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Notes">
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={onChange}
                  style={styles.textarea}
                />
              </Field>
            </div>
          </div>

          <div style={styles.footer}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={canSubmit ? styles.primaryBtn : styles.primaryBtnDisabled}
            >
              {loading ? "Saving..." : "Create sponsor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#070812", color: "#fff" },
  wrap: { maxWidth: 720, margin: "0 auto", padding: 16 },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  kicker: { fontSize: 12, opacity: 0.6 },
  h1: { margin: 0 },

  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  },

  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  label: { fontSize: 13, opacity: 0.8 },

  input: {
    width: "100%",
    minWidth: 0,
    height: 40,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
  },

  textarea: {
    width: "100%",
    minHeight: 100,
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
  },

  footer: {
    marginTop: 20,
    display: "flex",
    justifyContent: "flex-end",
  },

  primaryBtn: {
    height: 42,
    padding: "0 16px",
    borderRadius: 12,
    border: "none",
    background: "#00ffd5",
    color: "#000",
    fontWeight: 700,
    cursor: "pointer",
  },

  primaryBtnDisabled: {
    height: 42,
    padding: "0 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.4)",
    color: "rgba(255,255,255,0.4)",
    cursor: "not-allowed",
  },

  secondaryBtn: {
    height: 36,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.3)",
    background: "transparent",
    color: "#fff",
  },

  alert: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: "rgba(255,0,0,0.15)",
  },
};
