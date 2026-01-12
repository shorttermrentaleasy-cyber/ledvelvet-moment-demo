"use client";

const HERO_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/16wk3mKNNsjg3idhix5pygKP6lMHZ_S5O";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminTopbarClient from "../../AdminTopbarClient";

type SponsorOption = { id: string; label: string };

type MetaResponse = {
  ok: boolean;
  statusOptions?: string[];
  ticketPlatformOptions?: string[];
};

function isHttpUrl(v: string) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Converte i link Google Drive in un URL diretto compatibile con Airtable attachment:
 * - https://drive.google.com/file/d/<ID>/view?...  -> https://drive.google.com/uc?export=view&id=<ID>
 * - https://drive.google.com/open?id=<ID>          -> https://drive.google.com/uc?export=view&id=<ID>
 * - https://drive.google.com/uc?id=<ID>...         -> https://drive.google.com/uc?export=view&id=<ID>
 * Se è già un URL immagine normale, lo lascia com'è.
 */
function normalizeDriveImageUrl(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";

  // già in formato diretto
  if (s.includes("drive.google.com/uc?") && s.includes("id=")) return s;

  // /file/d/<ID>/view
  const m1 = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;

  // open?id=<ID>
  const m2 = s.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1]) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;

  // uc?id=<ID>
  const m3 = s.match(/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if (m3?.[1]) return `https://drive.google.com/uc?export=view&id=${m3[1]}`;

  return s;
}

function bestSponsorLabel(x: any): string {
  // prova tutte le varianti possibili, ma evita di ricadere subito sul record id
  const candidates = [
    x?.label,
    x?.brandName,
    x?.brand,
    x?.name,
    x?.Name,
    x?.fields?.["Brand Name"],
    x?.fields?.Brand,
    x?.fields?.Company,
    x?.fields?.Name,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  return candidates[0] || "";
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

  const [existingFeatured, setExistingFeatured] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState({
    eventName: "",
    date: "", // YYYY-MM-DD
    City: "",
    Venue: "",
    Status: "",
    TicketPlatform: "",
    TicketUrl: "",
    HeroImageUrl: "", // link (anche Drive)
    TeaserUrl: "",
    AftermovieUrl: "",
    Featured: false,
    Notes: "",
    Sponsors: [] as string[], // rec...
  });

  const featuredWarningText = useMemo(() => {
    if (!form.Featured) return null;
    if (!existingFeatured) return "Stai impostando questo evento come FEATURED (Hero).";
    return `Esiste già un evento FEATURED: "${existingFeatured.name}". Se continui avrai PIÙ Featured.`;
  }, [form.Featured, existingFeatured]);

  useEffect(() => {
    let alive = true;

    async function loadMeta() {
      setMetaLoading(true);
      try {
        const r = await fetch("/api/admin/meta/events", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        if (r.ok && j?.ok) {
          setMeta({
            ok: true,
            statusOptions: Array.isArray(j.statusOptions) ? j.statusOptions : [],
            ticketPlatformOptions: Array.isArray(j.ticketPlatformOptions) ? j.ticketPlatformOptions : [],
          });
        } else {
          setMeta({ ok: false });
        }
      } catch {
        if (!alive) return;
        setMeta({ ok: false });
      } finally {
        if (!alive) return;
        setMetaLoading(false);
      }
    }

    async function loadSponsors() {
      setSponsorsLoading(true);
      try {
        const r = await fetch("/api/admin/sponsors", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        const items = Array.isArray(j?.sponsors) ? j.sponsors : Array.isArray(j?.items) ? j.items : [];
        const out: SponsorOption[] = items
          .map((x: any) => {
            const id = x?.id;
            const label = bestSponsorLabel(x);
            return { id, label };
          })
          .filter((s: SponsorOption) => !!s.id)
          .map((s: SponsorOption) => ({
            ...s,
            // se label vuota, SOLO allora ricadi su id (ma di solito non succede)
            label: s.label || s.id,
          }))
          .sort((a: SponsorOption, b: SponsorOption) => a.label.localeCompare(b.label, "it"));

        setSponsorOptions(out);
      } catch {
        if (!alive) return;
        setSponsorOptions([]);
      } finally {
        if (!alive) return;
        setSponsorsLoading(false);
      }
    }

    async function loadExistingFeatured() {
      try {
        const r = await fetch("/api/admin/events?featured=1", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        if (j?.featured?.id) {
          setExistingFeatured({ id: j.featured.id, name: j.featured.name || j.featured.id });
          return;
        }

        const items = Array.isArray(j?.events) ? j.events : Array.isArray(j?.items) ? j.items : [];
        const first = items.find((e: any) => Boolean(e?.fields?.Featured || e?.Featured));
        if (first) {
          const name = first?.fields?.["Event Name"] || first?.name || first?.id;
          setExistingFeatured({ id: first.id, name });
        } else {
          setExistingFeatured(null);
        }
      } catch {
        if (!alive) return;
        setExistingFeatured(null);
      }
    }

    loadMeta();
    loadSponsors();
    loadExistingFeatured();

    return () => {
      alive = false;
    };
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name } = e.target;

    if (e.target instanceof HTMLInputElement && e.target.type === "checkbox") {
      const checked = e.target.checked;
      setForm((p) => ({ ...p, [name]: checked }));
      return;
    }

    const value = (e.target as any).value;
    setForm((p) => ({ ...p, [name]: value }));
  }

  function toggleSponsor(id: string) {
    setForm((p) => {
      const has = p.Sponsors.includes(id);
      return { ...p, Sponsors: has ? p.Sponsors.filter((x) => x !== id) : [...p.Sponsors, id] };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!form.eventName.trim()) return setErr("Missing event name");

    if (form.Featured && existingFeatured) {
      const ok = window.confirm(`Esiste già un evento FEATURED: "${existingFeatured.name}". Continuare comunque?`);
      if (!ok) return;
    }

    // ✅ clean inputs (trim) + Drive normalize
    const ticketPlatform = String(form.TicketPlatform || "").trim();
    const ticketUrl = String(form.TicketUrl || "").trim();
    const teaser = String(form.TeaserUrl || "").trim();
    const after = String(form.AftermovieUrl || "").trim();

    const heroRaw = String(form.HeroImageUrl || "").trim();
    const hero = normalizeDriveImageUrl(heroRaw);

    // ✅ validate ONLY if not empty
    if (
      (ticketUrl && !isHttpUrl(ticketUrl)) ||
      (teaser && !isHttpUrl(teaser)) ||
      (after && !isHttpUrl(after)) ||
      (hero && !isHttpUrl(hero))
    ) {
      return setErr("URL non valido (Ticket/Teaser/Aftermovie/Hero)");
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        eventName: form.eventName.trim(),
        City: String(form.City || "").trim(),
        Venue: String(form.Venue || "").trim(),
        Status: String(form.Status || "").trim(),
        Notes: String(form.Notes || "").trim(),

        // ✅ empty -> null (così Airtable pulisce davvero il campo)
        TicketPlatform: ticketPlatform || null,
        TicketUrl: ticketUrl || null,
        TeaserUrl: teaser || null,
        AftermovieUrl: after || null,

        // ✅ attachment via URL diretto (Drive normalizzato)
        HeroImageUrl: hero || null,
      };

      const r = await fetch("/api/admin/events/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <AdminTopbarClient backHref="/admin/events" />

        <div style={styles.headerRow}>
          <h1 style={styles.h1}>Create Event</h1>
          <a href="/admin/events" style={styles.secondaryBtn}>
            Cancel
          </a>
        </div>

        {featuredWarningText && <div style={styles.warn}>{featuredWarningText}</div>}
        {err && <div style={styles.err}>{err}</div>}

        <form onSubmit={onSubmit} style={styles.card}>
          <div style={styles.grid}>
            <Field label="Event name">
              <input name="eventName" value={form.eventName} onChange={onChange} style={styles.input} required />
            </Field>

            <Field label="Date">
              {/* ✅ calendar icon visibile in dark */}
              <input type="date" name="date" value={form.date} onChange={onChange} style={styles.inputDate} />
            </Field>

            <Field label="City">
              <input name="City" value={form.City} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Venue">
              <input name="Venue" value={form.Venue} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Status">
              <select name="Status" value={form.Status} onChange={onChange} style={styles.input} disabled={metaLoading}>
                <option value="">—</option>
                {(meta.statusOptions || []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ticket Platform">
              <select
                name="TicketPlatform"
                value={form.TicketPlatform}
                onChange={onChange}
                style={styles.input}
                disabled={metaLoading}
              >
                <option value="">—</option>
                {(meta.ticketPlatformOptions || []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ticket URL">
              <input name="TicketUrl" value={form.TicketUrl} onChange={onChange} style={styles.input} />
            </Field>
            <Field label="Hero Google Drive URL (o direct image URL)">
  		<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
   		 <input
    	  name="HeroImageUrl"
    	  value={form.HeroImageUrl}
    	  onChange={onChange}
    	  style={{ ...styles.input, flex: 1 }}
    	/>
    	<a
    	  href={HERO_DRIVE_FOLDER_URL}
    	  target="_blank"
     	 rel="noreferrer"
     	 style={styles.driveBtn}
     	 title="Apri la cartella Drive dove caricare le immagini Hero"
   	 >
    	  Apri Drive
   	 </a>
  	</div>
	</Field>

            <Field label="Teaser URL (YouTube)">
              <input name="TeaserUrl" value={form.TeaserUrl} onChange={onChange} style={styles.input} />
            </Field>

            <Field label="Aftermovie URL (YouTube)">
              <input name="AftermovieUrl" value={form.AftermovieUrl} onChange={onChange} style={styles.input} />
            </Field>

            <label style={{ ...styles.checkRow, gridColumn: "1 / -1" }}>
              <span>Featured event (Hero)</span>
              <input type="checkbox" name="Featured" checked={form.Featured} onChange={onChange} />
            </label>

            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Notes">
                <textarea name="Notes" value={form.Notes} onChange={onChange} style={styles.textarea} />
              </Field>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={styles.sponsorHeader}>
                <div>
                  <div style={styles.label}>Sponsors</div>
                  <div style={styles.smallMuted}>Seleziona più sponsor.</div>
                </div>

                <button
                  type="button"
                  onClick={() => setSponsorsOpen((v) => !v)}
                  style={styles.sponsorToggle}
                  disabled={sponsorsLoading}
                >
                  {sponsorsOpen ? "Chiudi" : `Apri (${form.Sponsors.length})`}
                </button>
              </div>

              {sponsorsOpen && (
                <div style={styles.sponsorBox}>
                  {sponsorsLoading ? (
                    <div style={{ opacity: 0.75 }}>Loading sponsors…</div>
                  ) : (
                    sponsorOptions.map((s) => {
                      const checked = form.Sponsors.includes(s.id);
                      return (
                        <label key={s.id} style={styles.sponsorItem}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSponsor(s.id)} />
                          <span>{s.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={styles.footer}>
            <button type="submit" style={styles.primaryBtn} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </button>
            <a href="/admin/events" style={styles.secondaryBtn}>
              Cancel
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}

/* ---------------- UI ---------------- */

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
  wrap: { maxWidth: 980, margin: "0 auto", padding: 16 },

  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },

  h1: { margin: 0, fontSize: 26, fontWeight: 900 },
  label: { fontSize: 13, opacity: 0.8 },
  smallMuted: { fontSize: 11, opacity: 0.6 },

  warn: { marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,0,0,0.10)" },
  err: { marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(255,0,0,0.14)" },

  card: { marginTop: 16, padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.05)" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },

  field: { display: "flex", flexDirection: "column", gap: 6 },

  input: {
    height: 40,
    borderRadius: 10,
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "0 12px",
    outline: "none",
  },

  // ✅ specifico per input date: forza UI scura → icona calendario visibile
  inputDate: {
    height: 40,
    borderRadius: 10,
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "0 12px",
    outline: "none",
    colorScheme: "dark",
  },

driveBtn: {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,255,209,0.55)",
  background: "rgba(0,0,0,0.22)",
  color: "rgba(255,255,255,0.92)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
},


  textarea: {
    minHeight: 110,
    borderRadius: 10,
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "10px 12px",
    outline: "none",
  },

  checkRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
  },

  sponsorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
  },

  sponsorToggle: {
    height: 38,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.22)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },

  sponsorBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    maxHeight: 260,
    overflow: "auto",
  },

  sponsorItem: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" },

  footer: { marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" },

  primaryBtn: {
    height: 44,
    padding: "0 18px",
    borderRadius: 14,
    border: "1px solid rgba(0,255,209,0.9)",
    background: "rgba(0,255,209,0.95)",
    color: "rgba(5,6,14,0.95)",
    fontWeight: 900,
    cursor: "pointer",
  },

  secondaryBtn: {
    height: 44,
    padding: "0 18px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
  },
};
