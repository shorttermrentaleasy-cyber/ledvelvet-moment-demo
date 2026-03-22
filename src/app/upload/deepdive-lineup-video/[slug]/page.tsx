"use client";

import type { CSSProperties } from "react";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

function withCacheBuster(url: string, stamp?: number) {
  const u = (url || "").trim();
  if (!u) return "";
  if (/\bv=\d+\b/.test(u)) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}v=${stamp ?? Date.now()}`;
}

export default function DeepDiveLineupVideoUploadPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = useMemo(() => String(params?.slug || "").trim(), [params?.slug]);

  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState("");

  async function onUploadMp4(file: File) {
    try {
      setUploading(true);
      setError(null);
      setOkMsg(null);

      if (!slug) throw new Error("Slug mancante.");
      if (!file.type.includes("video")) throw new Error("File non valido: carica un MP4.");
      if (!file.name.toLowerCase().endsWith(".mp4")) throw new Error("Formato non valido: serve un file .mp4");
      if (file.size > 40 * 1024 * 1024) throw new Error("File troppo grande (max 40MB).");

      const signedRes = await fetch("/api/admin/deepdive-lineup-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
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

      const bucket = signedJson.bucket || "lineup_video";
      const path = signedJson.path;
      const token = signedJson.token;

      if (!path || !token) throw new Error("Token upload o path mancanti");

      const { error: uploadError } = await supabaseBrowser.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || "video/mp4",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload Supabase fallito: ${uploadError.message}`);
      }

      const pub = supabaseBrowser.storage.from(bucket).getPublicUrl(path);
      const baseUrl = pub?.data?.publicUrl || "";
      if (!baseUrl) throw new Error("Upload ok ma publicUrl mancante");

      const finalUrl = withCacheBuster(baseUrl, Date.now());

      const patchRes = await fetch(`/api/admin/deepdive/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineup_video_url: finalUrl,
        }),
      });

      const patchRaw = await patchRes.text();
      let patchJson: any = {};
      try {
        patchJson = patchRaw ? JSON.parse(patchRaw) : {};
      } catch {
        patchJson = { raw: patchRaw };
      }

      if (!patchRes.ok || patchJson?.ok === false) {
        throw new Error(
          patchJson?.error ||
            patchJson?.message ||
            patchJson?.raw ||
            `Sync Airtable fallito (${patchRes.status})`
        );
      }

      setPublicUrl(finalUrl);
      setOkMsg("Video caricato e collegato alla experience ✅");
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Errore upload");
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteReel() {
    const ok = window.confirm(
      `Vuoi scollegare il reel da questa experience?\n\nSlug: ${slug}\n\nIl link verrà rimosso da Airtable.`
    );
    if (!ok) return;

    try {
      setDeleting(true);
      setError(null);
      setOkMsg(null);

      const patchRes = await fetch(`/api/admin/deepdive/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineup_video_url: "",
        }),
      });

      const patchRaw = await patchRes.text();
      let patchJson: any = {};
      try {
        patchJson = patchRaw ? JSON.parse(patchRaw) : {};
      } catch {
        patchJson = { raw: patchRaw };
      }

      if (!patchRes.ok || patchJson?.ok === false) {
        throw new Error(
          patchJson?.error ||
            patchJson?.message ||
            patchJson?.raw ||
            `Delete reel fallito (${patchRes.status})`
        );
      }

      setPublicUrl("");
      setOkMsg("Reel scollegato dalla experience ✅");
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Errore delete reel");
    } finally {
      setDeleting(false);
    }
  }

  const pageStyle: CSSProperties = { background: "#0B0B0C", color: "#EDEDED", minHeight: "100vh" };
  const wrap: CSSProperties = { maxWidth: 820, margin: "0 auto", padding: 20 };
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
  const btnDanger: CSSProperties = {
    ...btn,
    background: "rgba(147,11,12,0.18)",
    border: "1px solid rgba(147,11,12,0.45)",
  };
  const help: CSSProperties = { fontSize: 12, opacity: 0.68, marginTop: 6, lineHeight: 1.4 };

  return (
    <main style={pageStyle}>
      <div style={wrap}>
        <div style={panel}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Upload Promo Reel</h1>
          <p style={{ marginTop: 8, opacity: 0.8, fontSize: 14 }}>
            Experience: <b>{slug || "—"}</b>
          </p>
          <p style={help}>
            Carica un file MP4 verticale o orizzontale. Il sistema lo salva su Supabase bucket{" "}
            <b>lineup_video</b> e aggiorna automaticamente Airtable campo <b>lineup_video_url</b>.
          </p>

          {error && <p style={{ color: "#ff6b6b", marginTop: 16 }}>{error}</p>}
          {okMsg && <p style={{ color: "#7CFCB3", marginTop: 16 }}>{okMsg}</p>}

          <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label
              style={{
                ...btn,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? "Uploading…" : "Seleziona MP4"}
              <input
                type="file"
                accept="video/mp4,video/*"
                style={{ display: "none" }}
                disabled={uploading || deleting || !slug}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (f) onUploadMp4(f);
                }}
              />
            </label>

            <button
              type="button"
              onClick={onDeleteReel}
              disabled={uploading || deleting || !slug}
              style={{
                ...btnDanger,
                opacity: uploading || deleting || !slug ? 0.65 : 1,
                cursor: uploading || deleting || !slug ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "Deleting…" : "Delete Reel"}
            </button>

            <Link href="/admin/deepdive" style={btn}>
              ← Back
            </Link>
          </div>

          <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
            Limite attuale: <b>40MB</b>. Formato richiesto: <b>.mp4</b>.
          </div>

          {publicUrl ? (
            <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
              <video
                key={publicUrl}
                src={publicUrl}
                controls
                muted
                playsInline
                preload="metadata"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  aspectRatio: "9 / 16",
                  objectFit: "cover",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.35)",
                }}
              />

              <div style={{ fontSize: 12, opacity: 0.75, wordBreak: "break-all" }}>
                URL aggiornato: {publicUrl}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 22, fontSize: 13, opacity: 0.72 }}>
              Nessun reel collegato al momento.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}