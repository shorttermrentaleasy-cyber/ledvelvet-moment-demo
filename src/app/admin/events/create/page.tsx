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
    sponsors: [] as string[], // Airtable recordIds (linked)
    ticketUrl: "",
    heroImageUrl: "",
    aftermovieUrl: "",
    notes: "",
  });

  const canSubmit = useMemo(() => {
    return !!form.eventName.trim() && !!form.date.trim() && !!form.status.trim() && !loading;
  }, [form, loading]);

  // LOAD META + SPONSORS
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingMeta(true);
      setError(null);

      try {
        const [metaRes, sponsorRes] = await Promise.all([
          fetch("/api/meta/events", { cache: "no-store" }),
          fetch("/api/admin/sponsors", { cache: "no-store" }),
        ]);

        const meta = await metaRes.json().catch(() => ({}));
        const sponsorData = await sponsorRes.json().catch(() => ({}));

        if (!alive) return;

        if (!metaRes.ok || !meta?.ok) {
          setError(meta?.error || "Errore caricamento meta");
        } else {
          setStatusOptions(meta.status || []);
          setTicketPlatformOptions(meta.ticketPlatform || []);
        }

        if (!sponsorRes.ok || !sponsorData?.ok) {
          setError((prev) => prev || sponsorData?.error || "Errore caricamento sponsor");
        } else {
          setSponsorOptions(sponsorData.sponsors || []);
        }
      } catch {
        if (!alive) return;
        setError("Errore caricamento dati");
      } finally {
        if (!alive) return;
        setLoadingMeta(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  function onChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function onSponsorsChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((prev) => ({ ...prev, sponsors: values }));
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

    const data = await r.json().catch(() => ({}));

    setLoading(false);

    if (!r.ok || !data.ok) {
      setError(data.error || "Errore creazione evento");
      return;
    }

    router.replace("/admin/events?refresh=1");
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>Create Event</h1>
            <p style={styles.sub}>
              Compila i campi essenziali e salva su Airtable. Status e Ticket Platform arrivano da
              Airtable. Sponsors arriva da Airtable (tabella SPONSOR).
            </p>
          </div>

          <div style={styles.headerActions}>
            <button
              type="button"
              onClick={() => router.push("/admin/events")}
              style={styles.secondaryBtn}
              disabled={loading}
            >
              Back
            </button>
          </div>
        </header>

        {error && (
          <div style={styles.alert}>
            <div style={styles.alertDot} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={onSubmit} style={styles.card}>
          <div style={styles.cardTop}>
            <div style={styles.cardTitle}>Event details</div>
            <div style={styles.badge}>{loadingMeta ? "Loading..." : "Ready"}</div>
          </div>

          <div style={styles.grid}>
            <Field label="Event name" required>
              <input
                name="eventName"
                placeholder="es. PROVA"
                onChange={onChange}
                value={form.eventName}
                style={styles.input}
                autoComplete="off"
                required
              />
            </Field>

            <Field label="Date" required>
              <input
                type="date"
                name="date"
                onChange={onChange}
                value={form.date}
                style={styles.input}
                required
              />
            </Field>

            <Field label="City">
              <input
                name="city"
                placeholder="es. MILANO"
                onChange={onChange}
                value={form.city}
                style={styles.input}
                autoComplete="off"
              />
            </Field>

            <Field label="Venue">
              <input
                name="venue"
                placeholder="es. FESTA"
                onChange={onChange}
                value={form.venue}
                style={styles.input}
                autoComplete="off"
              />
            </Field>

            <Field label="Status" required hint="Single select Airtable">
              <select
                name="status"
                onChange={onChange}
                value={form.status}
                style={styles.select}
                required
                disabled={loadingMeta}
              >
                <option value="">{loadingMeta ? "Loading..." : "Select status"}</option>
                {statusOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ticket platform" hint="Single select Airtable">
              <select
                name="ticketPlatform"
                onChange={onChange}
                value={form.ticketPlatform}
                style={styles.select}
                disabled={loadingMeta}
              >
                <option value="">{loadingMeta ? "Loading..." : "Select platform (optional)"}</option>
                {ticketPlatformOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sponsors" hint="Linked records (multi)">
              <select
                multiple
                name="sponsors"
                value={form.sponsors}
                onChange={onSponsorsChange}
                style={{ ...styles.select, height: 120, paddingTop: 8, paddingBottom: 8 }}
                disabled={loadingMeta}
              >
                {sponsorOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ticket URL" hint="http/https">
              <input
                name="ticketUrl"
                placeholder="https://..."
                onChange={onChange}
                value={form.ticketUrl}
                style={styles.input}
                autoComplete="off"
              />
            </Field>

            <Field label="Hero image URL" hint="Airtable attachment">
              <input
                name="heroImageUrl"
                placeholder="https://..."
                onChange={onChange}
                value={form.heroImageUrl}
                style={styles.input}
                autoComplete="off"
              />
            </Field>

            <Field label="Aftermovie URL" hint="Airtable attachment">
              <input
                name="aftermovieUrl"
                placeholder="https://..."
                onChange={onChange}
                value={form.aftermovieUrl}
                style={styles.input}
                autoComplete="off"
              />
            </Field>

            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Notes">
                <textarea
                  name="notes"
                  placeholder="Note interne…"
                  onChange={onChange}
                  value={form.notes}
                  style={styles.textarea}
                />
              </Field>
            </div>
          </div>

          <div style={styles.footer}>
            <div style={styles.footerHint}>
              * Required: <b>Event name</b>, <b>Date</b>, <b>Status</b>
            </div>

            <button
              type="submit"
              style={canSubmit ? styles.primaryBtn : styles.primaryBtnDisabled}
              disabled={!canSubmit}
            >
              {loading ? "Saving..." : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={styles.field}>
      <div style={styles.labelRow}>
        <span style={styles.label}>
          {label} {required ? <span style={styles.req}>*</span> : null}
        </span>
        {hint ? <span style={styles.hint}>{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(255,0,199,0.18), transparent 60%), radial-gradient(1000px 700px at 90% 10%, rgba(0,255,209,0.14), transparent 55%), #070812",
    position: "relative",
    overflow: "hidden",
  },
  bgGlowA: {
    position: "absolute",
    inset: "-200px auto auto -200px",
    width: 520,
    height: 520,
    background: "radial-gradient(circle, rgba(255,0,199,0.25), transparent 60%)",
    filter: "blur(6px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    inset: "auto -220px -220px auto",
    width: 620,
    height: 620,
    background: "radial-gradient(circle, rgba(0,255,209,0.18), transparent 60%)",
    filter: "blur(8px)",
    pointerEvents: "none",
  },
  wrap: {
    position: "relative",
    maxWidth: 980,
    margin: "0 auto",
    padding: "28px 18px 48px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.7,
    marginBottom: 6,
  },
  h1: { fontSize: 34, margin: 0, lineHeight: 1.1 },
  sub: { margin: "10px 0 0", opacity: 0.75, maxWidth: 680 },
  headerActions: { display: "flex", gap: 10 },
  card: {
    borderRadius: 18,
    padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: 650, opacity: 0.95 },
  badge: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.28)",
    opacity: 0.9,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  label: { fontSize: 13, opacity: 0.86 },
  req: { color: "rgba(0,255,209,0.95)" },
  hint: { fontSize: 12, opacity: 0.55 },

  input: {
    height: 42,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    background: "rgba(5,6,14,0.55)",
    color: "rgba(255,255,255,0.92)",
    colorScheme: "dark",
    accentColor: "rgba(0,255,209,0.95)",
  },
  select: {
    height: 42,
    padding: "0 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    background: "rgba(5,6,14,0.55)",
    color: "rgba(255,255,255,0.92)",
    colorScheme: "dark",
    accentColor: "rgba(0,255,209,0.95)",
  },
  textarea: {
    minHeight: 110,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    background: "rgba(5,6,14,0.55)",
    color: "rgba(255,255,255,0.92)",
    resize: "vertical",
    colorScheme: "dark",
    accentColor: "rgba(0,255,209,0.95)",
  },

  alert: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,0,100,0.35)",
    background: "rgba(255,0,100,0.10)",
    marginBottom: 14,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(255,0,199,0.85)",
    boxShadow: "0 0 18px rgba(255,0,199,0.55)",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginTop: 16,
  },
  footerHint: { fontSize: 12, opacity: 0.65 },
  primaryBtn: {
    height: 44,
    padding: "0 16px",
    borderRadius: 14,
    border: "1px solid rgba(0,255,209,0.35)",
    background: "linear-gradient(90deg, rgba(0,255,209,0.18), rgba(255,0,199,0.14))",
    color: "rgba(255,255,255,0.95)",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  primaryBtnDisabled: {
    height: 44,
    padding: "0 16px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.55)",
    cursor: "not-allowed",
  },
  secondaryBtn: {
    height: 40,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
  },
};
