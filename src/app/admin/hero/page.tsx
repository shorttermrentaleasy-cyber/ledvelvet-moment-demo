"use client";

import type { CSSProperties } from "react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminTopbarClient from "../AdminTopbarClient";
import { supabaseBrowser } from "@/lib/supabase/browser";

type HeroRec = {
  id: string;
  title: string;
  subtitle: string;
  active: boolean;
  videoUrl: string; // URL pubblico Supabase (readonly lato admin, lo imposta il server)
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

function withCacheBuster(url: string, stamp?: number) {
  const u = (url || "").trim();
  if (!u) return "";
  // se già ha v= lascialo, altrimenti aggiungilo
  if (/\bv=\d+\b/.test(u)) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}v=${stamp ?? Date.now()}`;
}

export default function AdminHeroPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [hero, setHero] = useState<HeroRec>({
    id: "",
    title: "",
    subtitle: "",
    active: false,
    videoUrl: "",
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

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

        const rawVideoUrl = pickField(fields, ["videoUrl", "VideoUrl", "video_url"]) ?? "";
        const videoUrl = withCacheBuster(asString(rawVideoUrl));

        setHero({
          id: rec.id ?? fields.id ?? "",
          title: String(title ?? ""),
          subtitle: String(subtitle ?? ""),
          active,
          videoUrl,
        });
      } catch (e: any) {
        setError(e?.message || "Errore");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    // reset player quando cambia URL
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    setMuted(true);
    try {
      v.load();
    } catch {}
  }, [hero.videoUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSaving(true);
      setError(null);
      setOkMsg(null);

      const payload = {
        id: hero.id,
        title: hero.title || "",
        subtitle: hero.subtitle || "",
        active: !!hero.active,
        videoUrl: hero.videoUrl || "",
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

      const rawVideoUrl = pickField(fields, ["videoUrl", "VideoUrl", "video_url"]) ?? hero.videoUrl;
      const videoUrl = withCacheBuster(asString(rawVideoUrl));

      setHero((h) => ({
        ...h,
        title: String(title ?? ""),
        subtitle: String(subtitle ?? ""),
        active,
        videoUrl,
      }));

      setOkMsg("Salvato ✅");
      try {
        localStorage.setItem("lv_hero_updated_at", String(Date.now()));
      } catch {}
      setTimeout(() => setOkMsg(null), 1500);
    } catch (e: any) {
      setError(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

 async function onUploadMp4(file: File) {
  try {
    setUploading(true);
    setError(null);
    setOkMsg(null);

    if (!file.type.includes("video")) throw new Error("File non valido: carica un MP4.");
    if (file.size > 50 * 1024 * 1024) throw new Error("File troppo grande (max 50MB).");

    const signedRes = await fetch("/api/admin/hero-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heroId: hero.id }),
    });

    const signedRaw = await signedRes.text();
    let signedJson: any = {};
    try {
      signedJson = signedRaw ? JSON.parse(signedRaw) : {};
    } catch {
      signedJson = { raw: signedRaw };
    }

    if (!signedRes.ok || signedJson?.ok === false) {
      throw new Error(
        signedJson?.error ||
          signedJson?.message ||
          signedJson?.raw ||
          `Errore signed upload (${signedRes.status})`
      );
    }

    const bucket = signedJson.bucket || "hero";
    const path = signedJson.path || "hero.mp4";
    const token = signedJson.token;

    if (!token) throw new Error("Token upload mancante");

    const { error: uploadError } = await supabaseBrowser.storage
      .from(bucket)
      .uploadToSignedUrl(path, token, file, {
        contentType: file.type || "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload Supabase fallito: ${uploadError.message}`);
    }

    const pub = supabaseBrowser.storage.from(bucket).getPublicUrl(path);
    const baseUrl = pub?.data?.publicUrl || "";
    if (!baseUrl) throw new Error("Upload ok ma publicUrl mancante");

    const videoUrl = withCacheBuster(baseUrl, Date.now());

    const r = await fetch("/api/admin/hero", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: hero.id, videoUrl }),
    });

    const raw = await r.text();
    let j: any = {};
    try {
      j = raw ? JSON.parse(raw) : {};
    } catch {
      j = { raw };
    }

    if (!r.ok || j?.ok === false) {
      throw new Error(j?.error || j?.message || j?.raw || `Sync HERO fallito (${r.status})`);
    }

    setHero((h) => ({ ...h, videoUrl }));
    setOkMsg("Video caricato ✅");

    try {
      localStorage.setItem("lv_hero_updated_at", String(Date.now()));
    } catch {}

    setTimeout(() => setOkMsg(null), 1500);

    setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      try {
        v.muted = true;
        setMuted(true);
        v.load();
        v.play().catch(() => {});
      } catch {}
    }, 50);
  } catch (e: any) {
    setError(e?.message || "Errore upload");
  } finally {
    setUploading(false);
  }
}

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) v.play().catch(() => {});
  }

  async function goFullscreen() {
    const v = videoRef.current as any;
    if (!v) return;
    const req = v.requestFullscreen || v.webkitRequestFullscreen || v.mozRequestFullScreen || v.msRequestFullscreen;
    if (req) {
      try {
        await req.call(v);
      } catch {}
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
    cursor: "pointer",
  };
  const btnPrimary: CSSProperties = {
    ...btn,
    background: "#FFFFFF",
    color: "#0B0B0C",
    border: "1px solid #FFFFFF",
    opacity: canSubmit ? 1 : 0.6,
    cursor: canSubmit ? "pointer" : "not-allowed",
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
  const help: CSSProperties = { fontSize: 12, opacity: 0.65, marginTop: 6, lineHeight: 1.35 };

  return (
    <main style={pageStyle}>
      <AdminTopbarClient backHref="/admin" />

      <div style={wrap}>
        <div style={panel}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Hero</h1>
          <p style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
            Hero = <b>solo MP4</b> su Supabase Storage. Niente poster/immagini/YouTube.
          </p>

          {loading && <p style={{ opacity: 0.75 }}>Caricamento…</p>}
          {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
          {okMsg && <p style={{ color: "#7CFCB3" }}>{okMsg}</p>}

          {!loading && (
            <form onSubmit={onSubmit} style={grid}>
              {/* VIDEO HERO */}
              <div style={panel}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Video Hero (MP4)</div>
                    <div style={help}>
                      Carichi un MP4 → viene salvato in Supabase (bucket <b>hero</b>) come <b>hero/hero.mp4</b> e il sito lo
                      legge da lì.
                    </div>
                  </div>

                  <label style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 10, opacity: uploading ? 0.7 : 1 }}>
                    {uploading ? "Uploading…" : "Upload MP4"}
                    <input
                      type="file"
                      accept="video/mp4,video/*"
                      style={{ display: "none" }}
                      disabled={uploading || !hero.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.currentTarget.value = "";
                        if (f) onUploadMp4(f);
                      }}
                    />
                  </label>
                </div>

                <div style={{ marginTop: 14 }}>
                  {hero.videoUrl ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <video
                        key={hero.videoUrl} // ✅ forza remount (evita buffer vecchio)
                        ref={videoRef}
                        muted
                        playsInline
			preload="metadata"
                        controls={false}
                        style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)" }}
                      >
                        <source src={hero.videoUrl} type="video/mp4" />
                      </video>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="button" style={btn} onClick={() => videoRef.current?.play().catch(() => {})}>
                          Play
                        </button>
                        <button type="button" style={btn} onClick={() => videoRef.current?.pause()}>
                          Pause
                        </button>
                        <button type="button" style={btn} onClick={toggleMute}>
                          {muted ? "Unmute" : "Mute"}
                        </button>
                        <button type="button" style={btn} onClick={goFullscreen}>
                          Fullscreen
                        </button>
                        <a href={hero.videoUrl} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>
                          Open ↗
                        </a>
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.65 }}>
                        URL (readonly): <span style={{ opacity: 0.9 }}>{hero.videoUrl}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      Nessun video caricato. Premi <b>Upload MP4</b>.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label style={label}>Title</label>
                <input style={input} value={hero.title} onChange={(e) => setHero((h) => ({ ...h, title: e.target.value }))} />
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
                <Link href="/admin" style={{ ...btn, textDecoration: "none" }}>
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
