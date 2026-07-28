"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Media = { id?: string; url: string; filename?: string } | null;
type Track = {
  id: string;
  title: string;
  artist: string;
  sort: number;
  active: boolean;
  audio: Media;
  cover: Media;
  audio_url_override: string;
};

const emptyTrack: Track = {
  id: "",
  title: "",
  artist: "",
  sort: 0,
  active: true,
  audio: null,
  cover: null,
  audio_url_override: "",
};

export default function PlaylistAdminPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [draft, setDraft] = useState<Track>(emptyTrack);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeField, setActiveField] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/playlist", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error || "Caricamento fallito");
      setTracks(Array.isArray(json.tracks) ? json.tracks : []);
      setActiveField(String(json.activeField || ""));
    } catch (error: any) {
      setMessage(error?.message || "Caricamento fallito");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(file: File, kind: "audio" | "cover") {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    const response = await fetch("/api/admin/playlist-upload", { method: "POST", body });
    const json = await response.json();
    if (!response.ok || !json?.ok) throw new Error(json?.error || "Upload fallito");
    setDraft((current) => ({ ...current, [kind]: { url: json.url, filename: json.filename } }));
  }

  async function save() {
    if (!draft.title.trim()) return setMessage("Inserisci il titolo.");
    if (!draft.audio?.url && !draft.audio_url_override) return setMessage("Carica il file MP3.");
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/playlist", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          audio_url: draft.audio?.url || "",
          cover_url: draft.cover?.url || "",
          audio_attachment_id: draft.audio?.id || "",
          cover_attachment_id: draft.cover?.id || "",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error || "Salvataggio fallito");
      setDraft(emptyTrack);
      setMessage(draft.id ? "Traccia aggiornata." : "Traccia aggiunta.");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  }

  async function remove(track: Track) {
    if (!confirm(`Eliminare definitivamente “${track.title}”?`)) return;
    const response = await fetch(`/api/admin/playlist?id=${encodeURIComponent(track.id)}`, {
      method: "DELETE",
    });
    const json = await response.json();
    if (!response.ok || !json?.ok) return setMessage(json?.error || "Eliminazione fallita");
    if (draft.id === track.id) setDraft(emptyTrack);
    setMessage("Traccia eliminata.");
    await load();
  }

  return (
    <main style={styles.page}>
      <section style={styles.wrap}>
        <div style={styles.top}>
          <div>
            <p style={styles.eyebrow}>LEDVELVET ADMIN</p>
            <h1 style={styles.title}>Ambient Playlist</h1>
            <p style={styles.subtitle}>Gestisci la musica della Hero senza aprire Airtable.</p>
          </div>
          <Link href="/admin" style={styles.back}>← Menu admin</Link>
        </div>

        {message && <div style={styles.message}>{message}</div>}

        <section style={styles.card}>
          <h2 style={styles.h2}>{draft.id ? "Modifica traccia" : "Aggiungi traccia"}</h2>
          <div style={styles.grid}>
            <label style={styles.label}>Titolo
              <input style={styles.input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label style={styles.label}>Artista
              <input style={styles.input} value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} />
            </label>
            <label style={styles.label}>Ordine
              <input style={styles.input} type="number" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) })} />
            </label>
            {activeField && <label style={styles.check}>
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Attiva nella Hero
            </label>}
          </div>

          <div style={styles.mediaGrid}>
            <div style={styles.mediaBox}>
              <b>File MP3</b>
              {draft.audio?.url && <audio controls src={draft.audio.url} style={{ width: "100%" }} />}
              <label style={styles.upload}>
                {draft.audio ? "Sostituisci MP3" : "Carica MP3"}
                <input hidden type="file" accept=".mp3,audio/mpeg" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try { await upload(file, "audio"); } catch (error: any) { setMessage(error?.message || "Upload fallito"); }
                  e.target.value = "";
                }} />
              </label>
            </div>
            <div style={styles.mediaBox}>
              <b>Copertina</b>
              {draft.cover?.url && <img src={draft.cover.url} alt="" style={styles.cover} />}
              <label style={styles.upload}>
                {draft.cover ? "Sostituisci copertina" : "Carica copertina"}
                <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try { await upload(file, "cover"); } catch (error: any) { setMessage(error?.message || "Upload fallito"); }
                  e.target.value = "";
                }} />
              </label>
            </div>
          </div>

          <div style={styles.actions}>
            <button style={styles.primary} disabled={saving} onClick={save}>{saving ? "Salvataggio…" : draft.id ? "Salva modifiche" : "Aggiungi alla playlist"}</button>
            {draft.id && <button style={styles.secondary} onClick={() => setDraft(emptyTrack)}>Annulla</button>}
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>Tracce ({tracks.length})</h2>
          {loading ? <p>Caricamento…</p> : tracks.length === 0 ? <p>Nessuna traccia.</p> : (
            <div style={styles.list}>
              {tracks.map((track) => (
                <article key={track.id} style={styles.track}>
                  {track.cover?.url ? <img src={track.cover.url} alt="" style={styles.thumb} /> : <div style={styles.placeholder}>♪</div>}
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <b>{track.sort}. {track.title}</b>
                    <div style={styles.muted}>{track.artist || "Artista non indicato"}{activeField && !track.active ? " · Non attiva" : ""}</div>
                    {(track.audio?.url || track.audio_url_override) && <audio controls preload="none" src={track.audio_url_override || track.audio?.url} style={{ width: "100%", marginTop: 8 }} />}
                  </div>
                  <div style={styles.rowActions}>
                    <button style={styles.secondary} onClick={() => { setDraft(track); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Modifica</button>
                    <button style={styles.danger} onClick={() => remove(track)}>Elimina</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#070707", color: "#fff", padding: "34px 18px 70px" },
  wrap: { maxWidth: 1050, margin: "0 auto" },
  top: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap" },
  eyebrow: { color: "#d6b36a", letterSpacing: 2, fontSize: 12, margin: 0 },
  title: { fontSize: 38, margin: "7px 0" },
  subtitle: { color: "#aaa", margin: 0 },
  back: { color: "#fff", textDecoration: "none", border: "1px solid #444", borderRadius: 10, padding: "10px 14px" },
  card: { background: "#111", border: "1px solid #292929", borderRadius: 18, padding: 22, marginBottom: 20 },
  h2: { margin: "0 0 18px", fontSize: 22 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 },
  label: { display: "grid", gap: 7, color: "#ccc", fontSize: 13 },
  input: { background: "#080808", border: "1px solid #3a3a3a", borderRadius: 10, padding: "12px", color: "#fff", fontSize: 15 },
  check: { display: "flex", alignItems: "center", gap: 9, color: "#ddd", paddingTop: 23 },
  mediaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 18 },
  mediaBox: { border: "1px solid #333", borderRadius: 13, padding: 15, display: "grid", gap: 12 },
  upload: { display: "inline-block", width: "fit-content", background: "#262626", borderRadius: 9, padding: "10px 13px", cursor: "pointer" },
  cover: { width: 150, height: 150, objectFit: "cover", borderRadius: 10 },
  actions: { display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" },
  primary: { border: 0, borderRadius: 10, padding: "12px 16px", background: "#d6b36a", color: "#090909", fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #444", borderRadius: 9, padding: "9px 12px", background: "#191919", color: "#fff", cursor: "pointer" },
  danger: { border: "1px solid #653838", borderRadius: 9, padding: "9px 12px", background: "#281414", color: "#ffb5b5", cursor: "pointer" },
  message: { border: "1px solid #61502b", background: "#231e12", borderRadius: 10, padding: 12, marginBottom: 18 },
  list: { display: "grid", gap: 12 },
  track: { display: "flex", gap: 15, alignItems: "center", border: "1px solid #2e2e2e", borderRadius: 13, padding: 14, flexWrap: "wrap" },
  thumb: { width: 76, height: 76, objectFit: "cover", borderRadius: 9 },
  placeholder: { width: 76, height: 76, borderRadius: 9, background: "#222", display: "grid", placeItems: "center", fontSize: 28 },
  muted: { color: "#999", marginTop: 4, fontSize: 13 },
  rowActions: { display: "flex", gap: 8, flexWrap: "wrap" },
};
