"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MetaOption = {
  id: string;
  label: string;
};

export default function AdminCreateEventPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusOptions, setStatusOptions] = useState<MetaOption[]>([]);
  const [ticketPlatformOptions, setTicketPlatformOptions] = useState<MetaOption[]>([]);
  const [sponsorOptions, setSponsorOptions] = useState<MetaOption[]>([]);

  const [form, setForm] = useState({
    eventName: "",
    date: "",
    city: "",
    venue: "",
    status: "",
    ticketPlatform: "",
    sponsors: [] as string[],
    ticketUrl: "",
    heroImageUrl: "",
    aftermovieUrl: "",
    notes: "",
  });

  const canSubmit = useMemo(
    () => !!form.eventName && !!form.date && !!form.status && !loading,
    [form, loading]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [metaRes, sponsorRes] = await Promise.all([
          fetch("/api/meta/events", { cache: "no-store" }),
          fetch("/api/admin/sponsors", { cache: "no-store" }),
        ]);

        const meta = await metaRes.json();
        const sponsors = await sponsorRes.json();

        if (!alive) return;

        if (metaRes.ok && meta.ok) {
          setStatusOptions(meta.status || []);
          setTicketPlatformOptions(meta.ticketPlatform || []);
        } else {
          setError(meta.error || "Errore caricamento meta");
        }

        if (sponsorRes.ok && sponsors.ok) {
          setSponsorOptions(sponsors.sponsors || []);
        } else {
          setError(sponsors.error || "Errore caricamento sponsor");
        }
      } catch {
        if (alive) setError("Errore caricamento dati");
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

  function onSponsorsChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((p) => ({ ...p, sponsors: values }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    const r = await fetch("/api/admin/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await r.json();
    setLoading(false);

    if (!r.ok || !data.ok) {
      setError(data.error || "Errore creazione evento");
      return;
    }

    router.push("/admin/events?refresh=1");
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>Create Event</h1>
          </div>
          <button onClick={() => router.back()} style={styles.secondaryBtn}>
            Back
          </button>
        </header>

        {error && <div style={styles.alert}>{error}</div>}

        <form onSubmit={onSubmit} style={styles.card}>
          <div style={styles.grid}>
            <Field label="Event name *">
              <input name="eventName" value={form.eventName} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Date *">
              <input type="date" name="date" value={form.date} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="City">
              <input name="city" value={form.city} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Venue">
              <input name="venue" value={form.venue} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Status *">
              <select name="status" value={form.status} onChange={onChange} style={styles.input}>
                <option value="">Select</option>
                {statusOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ticket platform">
              <select
                name="ticketPlatform"
                value={form.ticketPlatform}
                onChange={onChange}
                style={styles.input}
              >
                <option value="">Optional</option>
                {ticketPlatformOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sponsors">
              <select
                multiple
                value={form.sponsors}
                onChange={onSponsorsChange}
                style={{ ...styles.input, height: 120 }}
              >
                {sponsorOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ticket URL">
              <input name="ticketUrl" value={form.ticketUrl} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Hero image URL">
              <input name="heroImageUrl" value={form.heroImageUrl} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Aftermovie URL">
              <input
                name="aftermovieUrl"
                value={form.aftermovieUrl}
                onChange={onChange}
                style={styles.input}
              />
            </Field>

            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Notes">
                <textarea name="notes" value={form.notes} onChange={onChange} style={styles.textarea} />
              </Field>
            </div>
          </div>

          <div style={styles.footer}>
            <button type="submit" disabled={!canSubmit} style={styles.primaryBtn}>
              {loading ? "Saving..." : "Create event"}
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" },
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
