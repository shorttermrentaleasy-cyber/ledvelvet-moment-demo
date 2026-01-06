"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SponsorOption = { id: string; label: string };
type MetaResponse = {
  ok: boolean;
  statusOptions?: string[];
  ticketPlatformOptions?: string[];
  error?: string;
};

function asString(v: any) {
  return String(v ?? "").trim();
}

// Your /api/admin/sponsors returns: { ok:true, sponsors:[{id,label}] }
function pickSponsorLabel(rec: any, fallbackId: string) {
  const direct = asString(rec?.label);
  if (direct) return direct;

  const fields = rec?.fields;
  if (fields && typeof fields === "object") {
    return (
      asString(fields["Brand Name"]) ||
      asString(fields["Brand"]) ||
      asString(fields["Company"]) ||
      asString(fields["Name"]) ||
      fallbackId
    );
  }

  return fallbackId;
}

function extractSponsorRecords(payload: any): any[] {
  if (Array.isArray(payload?.sponsors)) return payload.sponsors; // ✅ current route
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export default function AdminCreateEventPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [meta, setMeta] = useState<MetaResponse>({ ok: false });
  const [metaLoading, setMetaLoading] = useState(true);

  const [sponsorOptions, setSponsorOptions] = useState<SponsorOption[]>([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(true);
  const [sponsorsOpen, setSponsorsOpen] = useState(false);

  const [existingFeatured, setExistingFeatured] = useState<{ id: string; name: string } | null>(
    null
  );

  const [form, setForm] = useState({
    eventName: "",
    date: "", // YYYY-MM-DD (HTML date input)
    City: "",
    Venue: "",
    Status: "",
    TicketPlatform: "",
    TicketUrl: "",
    HeroImageUrl: "",
    TeaserUrl: "",
    AftermovieUrl: "",
    Featured: false,
    Notes: "",
    Sponsors: [] as string[], // MUST be Airtable record IDs (rec...)
  });

  const featuredWarningText = useMemo(() => {
    if (!form.Featured) return null;
    if (!existingFeatured) return "Stai impostando questo evento come FEATURED (Hero).";
    return `Esiste già un evento FEATURED: "${existingFeatured.name}". Se continui avrai PIÙ Featured.`;
  }, [form.Featured, existingFeatured]);

  function onChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!form.eventName.trim()) return setErr("Missing event name");

    if (form.Featured && existingFeatured) {
      const ok = window.confirm(
        `Esiste già un evento FEATURED: "${existingFeatured.name}". Continuare comunque?`
      );
      if (!ok) return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/admin/events/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          eventName: form.eventName.trim(),
        }),
      });

      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Create failed");

      router.push("/admin/events?refresh=1");
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setLoading(false);
    }
  }

  // META (Status + Ticket Platform)
  useEffect(() => {
    let alive = true;
    setMetaLoading(true);

    fetch("/api/admin/meta/events", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setMeta(j);
      })
      .catch(() => {
        if (!alive) return;
        setMeta({ ok: false, statusOptions: [], ticketPlatformOptions: [], error: "Meta load failed" });
      })
      .finally(() => {
        if (!alive) return;
        setMetaLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // SPONSORS (uses label, saves ID)
  useEffect(() => {
    let alive = true;
    setSponsorsLoading(true);

    fetch("/api/admin/sponsors", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (!alive) return;

        const recs = extractSponsorRecords(payload);

        const opts: SponsorOption[] = recs
          .map((rec: any) => {
            const id = asString(rec?.id || rec?.recordId || rec?._id);
            if (!id) return null;
            return { id, label: pickSponsorLabel(rec, id) };
          })
          .filter(Boolean) as SponsorOption[];

        opts.sort((a, b) => a.label.localeCompare(b.label));
        setSponsorOptions(opts);
      })
      .catch(() => {
        if (!alive) return;
        setSponsorOptions([]);
      })
      .finally(() => {
        if (!alive) return;
        setSponsorsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // FEATURED WARNING (optional)
  useEffect(() => {
    let alive = true;

    fetch("/api/admin/events", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const f = (j?.records || []).find((r0: any) => r0?.fields?.Featured);
        if (f) {
          setExistingFeatured({
            id: f.id,
            name: asString(f.fields?.["Event Name"]) || f.id,
          });
        } else {
          setExistingFeatured(null);
        }
      })
      .catch(() => {
        if (!alive) return;
        setExistingFeatured(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Create Event</div>
            <div style={styles.sub}>LedVelvet Admin</div>
          </div>
          <a href="/admin/events" style={styles.btnGhost}>
            Back
          </a>
        </div>

        {err && <div style={styles.alertError}>{err}</div>}
        {featuredWarningText && <div style={styles.alertWarn}>{featuredWarningText}</div>}

        <form onSubmit={onSubmit} style={styles.card}>
          <Field label="Event name *">
            <input
              name="eventName"
              value={form.eventName}
              onChange={onChange}
              style={styles.input}
              placeholder="Event name"
            />
          </Field>

          <Field label="Date">
            <input type="date" name="date" value={form.date} onChange={onChange} style={styles.input} />
          </Field>

          <Row>
            <Field label="City">
              <input name="City" value={form.City} onChange={onChange} style={styles.input} />
            </Field>
            <Field label="Venue">
              <input name="Venue" value={form.Venue} onChange={onChange} style={styles.input} />
            </Field>
          </Row>

          <Row>
            <Field label="Status">
              {metaLoading ? (
                <div style={styles.muted}>Loading…</div>
              ) : (
                <select name="Status" value={form.Status} onChange={onChange} style={styles.input}>
                  <option value="">—</option>
                  {(meta.statusOptions || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Ticket platform">
              {metaLoading ? (
                <div style={styles.muted}>Loading…</div>
              ) : (
                <select
                  name="TicketPlatform"
                  value={form.TicketPlatform}
                  onChange={onChange}
                  style={styles.input}
                >
                  <option value="">—</option>
                  {(meta.ticketPlatformOptions || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </Row>

          <Field label="Ticket URL">
            <input name="TicketUrl" value={form.TicketUrl} onChange={onChange} style={styles.input} />
          </Field>

          <Field label="Hero image URL (Attachment)">
            <input name="HeroImageUrl" value={form.HeroImageUrl} onChange={onChange} style={styles.input} />
          </Field>

          <Field label="Teaser URL (YouTube)">
            <input name="TeaserUrl" value={form.TeaserUrl} onChange={onChange} style={styles.input} />
          </Field>

          <Field label="Aftermovie URL (YouTube)">
            <input name="AftermovieUrl" value={form.AftermovieUrl} onChange={onChange} style={styles.input} />
          </Field>

          <label style={styles.checkRow}>
            <span>Featured event (Hero)</span>
            <input
              type="checkbox"
              checked={form.Featured}
              onChange={(e) => setForm((p) => ({ ...p, Featured: e.target.checked }))}
            />
          </label>

          <Field label="Sponsors (multiple)">
            {sponsorsLoading ? (
              <div style={styles.muted}>Loading…</div>
            ) : sponsorOptions.length === 0 ? (
              <div style={styles.alertError}>No sponsors returned from /api/admin/sponsors</div>
            ) : (
              <div style={styles.sponsorWrap}>
                <button type="button" onClick={() => setSponsorsOpen((v) => !v)} style={styles.sponsorToggle}>
                  <span>{form.Sponsors.length ? `Selected: ${form.Sponsors.length}` : "Select sponsors"}</span>
                  <span style={{ opacity: 0.7 }}>{sponsorsOpen ? "▲" : "▼"}</span>
                </button>

                {sponsorsOpen ? (
                  <div style={styles.sponsorBox}>
                    {sponsorOptions.map((s) => (
                      <label key={s.id} style={styles.sponsorItem}>
                        <input
                          type="checkbox"
                          checked={form.Sponsors.includes(s.id)}
                          onChange={() =>
                            setForm((p) => ({
                              ...p,
                              Sponsors: p.Sponsors.includes(s.id)
                                ? p.Sponsors.filter((x) => x !== s.id)
                                : [...p.Sponsors, s.id],
                            }))
                          }
                        />
                        <span style={{ opacity: 0.95 }}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Field>

          <Field label="Notes">
            <textarea name="Notes" value={form.Notes} onChange={onChange} style={styles.textarea} />
          </Field>

          <button type="submit" disabled={loading} style={styles.btnPrimary}>
            {loading ? "Creating…" : "Create event"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={styles.row}>{children}</div>;
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
  page: { minHeight: "100vh", background: "#050505", color: "#fff" },
  shell: { maxWidth: 900, margin: "0 auto", padding: 24 },

  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14 },
  title: { fontSize: 26, fontWeight: 800, letterSpacing: 0.2 },
  sub: { marginTop: 6, fontSize: 12, opacity: 0.65, letterSpacing: 1.2, textTransform: "uppercase" },

  card: {
    marginTop: 16,
    padding: 18,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    boxShadow: "0 14px 45px rgba(0,0,0,0.35)",
  },

  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  field: { display: "grid", gap: 6, marginTop: 12 },
  label: { fontSize: 12, opacity: 0.7, letterSpacing: 0.5 },

  input: {
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(0,0,0,0.40)",
    color: "#fff",
    padding: "0 10px",
    colorScheme: "dark",
    outline: "none",
  },
  textarea: {
    minHeight: 120,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(0,0,0,0.40)",
    color: "#fff",
    padding: 10,
    outline: "none",
  },

  checkRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.10)",
  },

  sponsorWrap: { display: "grid", gap: 10 },
  sponsorToggle: {
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(0,0,0,0.35)",
    color: "#fff",
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
  },
  sponsorBox: {
    maxHeight: 220,
    overflow: "auto",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 10,
    background: "rgba(0,0,0,0.25)",
  },
  sponsorItem: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 8 },

  muted: { opacity: 0.6, fontSize: 12, padding: "6px 0" },

  btnPrimary: {
    marginTop: 20,
    height: 44,
    borderRadius: 14,
    background: "#930b0c",
    color: "#fff",
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.10)",
    cursor: "pointer",
    letterSpacing: 0.4,
  },
  btnGhost: {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  alertError: {
    marginTop: 12,
    padding: 12,
    background: "rgba(255,0,0,0.15)",
    borderRadius: 12,
    border: "1px solid rgba(255,0,0,0.20)",
  },
  alertWarn: {
    marginTop: 12,
    padding: 12,
    background: "rgba(255,120,0,0.15)",
    borderRadius: 12,
    border: "1px solid rgba(255,120,0,0.20)",
  },
};
