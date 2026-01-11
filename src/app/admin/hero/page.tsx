"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminTopbarClient from "../AdminTopbarClient";

type HeroRec = {
  id: string;
  title: string;
  subtitle: string;
  active: boolean;

  videoUrl: string;
  posterUrl: string;
  imageUrl: string;
};

function asBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return ["true", "1", "yes", "y", "on"].includes(v.toLowerCase().trim());
  return false;
}

function pickField(fields: any, keys: string[]) {
  for (const k of keys) if (fields?.[k] != null) return fields[k];
  return undefined;
}

function asString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export default function AdminHeroPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [hero, setHero] = useState<HeroRec>({
    id: "",
    title: "",
    subtitle: "",
    active: false,
    videoUrl: "",
    posterUrl: "",
    imageUrl: "",
  });

  const canSubmit = useMemo(() => !loading && !saving && !!hero.id, [loading, saving, hero.id]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setOkMsg(null);

        const r = await fetch("/api/admin/hero", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));

        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Errore caricamento HERO");

        const rec = j.hero ?? j.data ?? j;
        const fields = rec.fields ?? rec;

        const title = pickField(fields, ["Title", "title", "HERO Title", "Hero Title"]) ?? "";
        const subtitle = pickField(fields, ["Subtitle", "subtitle", "HERO Subtitle", "Hero Subtitle"]) ?? "";
        const active = asBool(pickField(fields, ["Active", "active", "IsActive", "isActive"]) ?? false);

        // ✅ exact Airtable field names (as you said)
        const videoUrl = pickField(fields, ["videoUrl"]) ?? "";
        const posterUrl = pickField(fields, ["posterUrl"]) ?? "";
        const imageUrl = pickField(fields, ["imageUrl"]) ?? "";

        setHero({
          id: rec.id ?? fields.id ?? "",
          title: String(title ?? ""),
          subtitle: String(subtitle ?? ""),
          active,
          videoUrl: asString(videoUrl),
          posterUrl: asString(posterUrl),
          imageUrl: asString(imageUrl),
        });
      } catch (e: any) {
        setError(e?.message || "Errore");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSaving(true);
      setError(null);
      setOkMsg(null);

      // ✅ NOW we send also the 3 link fields
      const payload = {
        id: hero.id,
        title: hero.title || "",
        subtitle: hero.subtitle || "",
        active: !!hero.active,
        videoUrl: hero.videoUrl || "",
        posterUrl: hero.posterUrl || "",
        imageUrl: hero.imageUrl || "",
      };

      const r = await fetch("/api/admin/hero", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Errore salvataggio");

      const updated = j.hero ?? j.data ?? j;
      const fields = updated.fields ?? updated;

      const title = pickField(fields, ["Title", "title", "HERO Title", "Hero Title"]) ?? hero.title;
      const subtitle = pickField(fields, ["Subtitle", "subtitle", "HERO Subtitle", "Hero Subtitle"]) ?? hero.subtitle;
      const active = asBool(pickField(fields, ["Active", "active", "IsActive", "isActive"]) ?? hero.active);

      const videoUrl = pickField(fields, ["videoUrl"]) ?? hero.videoUrl;
      const posterUrl = pickField(fields, ["posterUrl"]) ?? hero.posterUrl;
      const imageUrl = pickField(fields, ["imageUrl"]) ?? hero.imageUrl;

      setHero((h) => ({
        ...h,
        title: String(title ?? ""),
        subtitle: String(subtitle ?? ""),
        active,
        videoUrl: asString(videoUrl),
        posterUrl: asString(posterUrl),
        imageUrl: asString(imageUrl),
      }));

      setOkMsg("Salvato ✅");
      setTimeout(() => setOkMsg(null), 1500);
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setSaving(false);
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
  const btnMini: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#EDEDED",
    textDecoration: "none",
    fontSize: 13,
    whiteSpace: "nowrap",
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
      <AdminTopbarClient backHref="/admin" />

      <div style={wrap}>
        <div style={panel}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Hero</h1>
          <p style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>Gestione contenuti HERO (Title, Subtitle, Active).</p>

          {loading && <p style={{ opacity: 0.75 }}>Caricamento…</p>}
          {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
          {okMsg && <p style={{ color: "#7CFCB3" }}>{okMsg}</p>}

          {!loading && (
            <form onSubmit={onSubmit} style={grid}>
              {/* Media fields (editable now, saved via PATCH) */}
              <div style={panel}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>Media (campi link su Airtable)</div>

                  <div>
                    <label style={label}>videoUrl</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input
                        style={input}
                        value={hero.videoUrl}
                        onChange={(e) => setHero((h) => ({ ...h, videoUrl: e.target.value }))}
                      />
                      {hero.videoUrl ? (
                        <a href={hero.videoUrl} target="_blank" rel="noreferrer" style={btnMini}>
                          Open ↗
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label style={label}>posterUrl</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input
                        style={input}
                        value={hero.posterUrl}
                        onChange={(e) => setHero((h) => ({ ...h, posterUrl: e.target.value }))}
                      />
                      {hero.posterUrl ? (
                        <a href={hero.posterUrl} target="_blank" rel="noreferrer" style={btnMini}>
                          Open ↗
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label style={label}>imageUrl</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input
                        style={input}
                        value={hero.imageUrl}
                        onChange={(e) => setHero((h) => ({ ...h, imageUrl: e.target.value }))}
                      />
                      {hero.imageUrl ? (
                        <a href={hero.imageUrl} target="_blank" rel="noreferrer" style={btnMini}>
                          Open ↗
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    Nota: questi tre campi vengono ora salvati anche dall’admin (PATCH).
                  </div>
                </div>
              </div>

              <div>
                <label style={label}>Title</label>
                <input
                  style={input}
                  value={hero.title}
                  onChange={(e) => setHero((h) => ({ ...h, title: e.target.value }))}
                />
              </div>

              <div>
                <label style={label}>Subtitle</label>
                <textarea
                  style={{ ...input, minHeight: 90, resize: "vertical" }}
                  value={hero.subtitle}
                  onChange={(e) => setHero((h) => ({ ...h, subtitle: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  id="hero-active"
                  type="checkbox"
                  checked={hero.active}
                  onChange={(e) => setHero((h) => ({ ...h, active: e.target.checked }))}
                />
                <label htmlFor="hero-active" style={{ opacity: 0.9 }}>
                  Active
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                <Link href="/admin" style={btn}>
                  ← Back
                </Link>

                <button type="submit" style={btnPrimary} disabled={!canSubmit}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
