"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type MediaAttachment = {
  id?: string;
  url: string;
  filename?: string;
};

type DeepDiveEdit = {
  airtable_record_id: string;
  slug: string;

  is_published: boolean;
  event_ref: string[];
  event_date: string;

  title_override: string;

  title_deepdive: string;

  subtitle: string;

  hero_media_type: "image" | "youtube" | "mp4";
  hero_youtube_url: string;
  hero_mp4_url: string;

  concept: string;
  place_story: string;
  lineup_text: string;
  invite_text: string;

  // ✅ now single select values
  atmosphere_sound: string | null;
  atmosphere_light: string | null;
  atmosphere_energy: string | null;

  // keep readonly for now
  cta_primary_label: string;
  cta_secondary_label: string;

  sort_order: number | null;
  driver_folder_url: string;

  hero_media_note: string;
  gallery_note: string;

  hero_image_url: string;
  gallery: MediaAttachment[];
  gallery_count: number;
  music_mood: MediaAttachment[];
};

// ------------------------------------------------------------------
// ✅ Put here the SAME options you have in Airtable single-select
// When you add/remove options in Airtable, update these arrays.
// ------------------------------------------------------------------

const ATMOS_SOUND_OPTIONS: string[] = [
  // es: "Silk Bass", "Analog Hiss", "Cathedral Echo"
];

const ATMOS_LIGHT_OPTIONS: string[] = [
  // es: "Red Glow", "Candlelight", "Strobe Soft"
];

const ATMOS_ENERGY_OPTIONS: string[] = [
  // es: "Hypnotic", "Ritual", "Explosive"
];


function inputClass() {
  return "w-full bg-black/40 border border-white/15 focus:border-white/30 outline-none px-3 py-2 text-sm";
}
function textareaClass() {
  return "w-full min-h-[120px] bg-black/40 border border-white/15 focus:border-white/30 outline-none px-3 py-2 text-sm";
}
function readonlyClass() {
  return "w-full bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/70";
}
function sectionCard() {
  return "border border-white/10 bg-[var(--surface2)] p-4";
}
function advancedCard() {
  return "border border-white/10 bg-[var(--surface2)]";
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <select className={inputClass()} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {options.length === 0 ? <div className="mt-1 text-[11px] text-white/50">Nessuna opzione disponibile.</div> : null}
    </div>
  );
}

export default function AdminDeepDiveEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const palette = useMemo(
    () => ({
      bg: "#050505",
      surface: "#080808",
      surface2: "#0c0c0c",
      text: "#F5F5F5",
      muted: "rgba(245,245,245,0.70)",
      border: "rgba(255,255,255,0.10)",
      redAccent: "#930b0c",
    }),
    []
  );

  const [data, setData] = useState<DeepDiveEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [musicBusy, setMusicBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState<any>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setMsg(null);

        const res = await fetch(`/api/admin/deepdive/${encodeURIComponent(String(slug))}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Save Failed");
        localStorage.setItem("lv_events_updated_at", String(Date.now()));
        if (!alive) return;
        setData(json.deepdive as DeepDiveEdit);
        setForm(json.deepdive);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Unexpected error");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  async function onSave() {
    try {
      setSaving(true);
      setErr(null);
      setMsg(null);

      const payload = {
        is_published: Boolean(form.is_published),

        title_deepdive: String(form.title_deepdive || ""),
        subtitle: String(form.subtitle || ""),

        hero_media_type: form.hero_media_type,
        hero_youtube_url: String(form.hero_youtube_url || ""),
        hero_mp4_url: String(form.hero_mp4_url || ""),

        concept: String(form.concept || ""),
        place_story: String(form.place_story || ""),
        lineup_text: String(form.lineup_text || ""),
        invite_text: String(form.invite_text || ""),

        // ✅ single select: send string or null
        atmosphere_sound: form.atmosphere_sound ? String(form.atmosphere_sound) : null,
        atmosphere_light: form.atmosphere_light ? String(form.atmosphere_light) : null,
        atmosphere_energy: form.atmosphere_energy ? String(form.atmosphere_energy) : null,

        sort_order: form.sort_order === "" || form.sort_order == null ? null : Number(form.sort_order),

        driver_folder_url: String(form.driver_folder_url || ""),

        hero_media_note: String(form.hero_media_note || ""),
        gallery_note: String(form.gallery_note || ""),
      };

      const res = await fetch(`/api/admin/deepdive/${encodeURIComponent(String(slug))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed");

      setMsg("Saved.");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function refreshMedia(successMessage: string) {
    const refreshed = await fetch(`/api/admin/deepdive/${encodeURIComponent(String(slug))}`, {
      cache: "no-store",
    });
    const refreshedJson = await refreshed.json().catch(() => null);
    if (!refreshed.ok || !refreshedJson?.ok) {
      throw new Error(refreshedJson?.error || "Rilettura media fallita");
    }

    const nextData = refreshedJson.deepdive as DeepDiveEdit;
    setData(nextData);
    setForm((current: any) => ({ ...current, ...nextData }));
    setMsg(successMessage);
    localStorage.setItem("lv_events_updated_at", String(Date.now()));
  }

  async function saveGallery(gallery: MediaAttachment[], successMessage: string) {
    const res = await fetch(`/api/admin/deepdive/${encodeURIComponent(String(slug))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gallery }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Aggiornamento gallery fallito");

    await refreshMedia(successMessage);
  }

  async function onGalleryUpload(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    try {
      setGalleryBusy(true);
      setErr(null);
      setMsg(null);

      for (const file of selected) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`${file.name}: seleziona soltanto immagini.`);
        }
        if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
          throw new Error(`${file.name}: usa JPG, PNG, WEBP o GIF.`);
        }
        if (file.size > 4 * 1024 * 1024) {
          throw new Error(`${file.name}: file troppo grande (massimo 4 MB).`);
        }
      }

      const additions: MediaAttachment[] = [];
      for (const file of selected) {
        const uploadBody = new FormData();
        uploadBody.append("slug", String(slug));
        uploadBody.append("file", file);
        const uploadRes = await fetch("/api/admin/deepdive-gallery-upload", {
          method: "POST",
          body: uploadBody,
        });
        const upload = await uploadRes.json().catch(() => null);
        if (!uploadRes.ok || !upload?.ok) {
          throw new Error(upload?.error || `Caricamento non disponibile per ${file.name}`);
        }
        additions.push({ url: upload.url, filename: upload.filename || file.name });
      }

      await saveGallery([...(data?.gallery || []), ...additions], "Gallery aggiornata.");
    } catch (error: any) {
      setErr(error?.message || "Caricamento gallery fallito");
    } finally {
      setGalleryBusy(false);
    }
  }

  async function saveMusic(musicMood: MediaAttachment[], successMessage: string) {
    const res = await fetch(`/api/admin/deepdive/${encodeURIComponent(String(slug))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ music_mood: musicMood }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Aggiornamento musica fallito");
    await refreshMedia(successMessage);
  }

  async function onMusicUpload(file: File | null) {
    if (!file) return;

    try {
      setMusicBusy(true);
      setErr(null);
      setMsg(null);

      if (file.type !== "audio/mpeg" && !file.name.toLowerCase().endsWith(".mp3")) {
        throw new Error("Seleziona un file MP3.");
      }
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("File troppo grande (massimo 20 MB).");
      }

      const uploadBody = new FormData();
      uploadBody.append("slug", String(slug));
      uploadBody.append("file", file);
      const uploadRes = await fetch("/api/admin/deepdive-music-upload", {
        method: "POST",
        body: uploadBody,
      });
      const upload = await uploadRes.json().catch(() => null);
      if (!uploadRes.ok || !upload?.ok) {
        throw new Error(upload?.error || "Caricamento musica non disponibile");
      }

      await saveMusic(
        [{ url: upload.url, filename: upload.filename || file.name }],
        data?.music_mood?.length ? "Musica sostituita." : "Musica collegata."
      );
    } catch (error: any) {
      setErr(error?.message || "Caricamento musica fallito");
    } finally {
      setMusicBusy(false);
    }
  }

  async function onMusicRemove() {
    const attachment = data?.music_mood?.[0];
    if (!attachment) return;
    if (!window.confirm(`Rimuovere “${attachment.filename || "audio atmosfera"}”?`)) return;

    try {
      setMusicBusy(true);
      setErr(null);
      setMsg(null);
      await saveMusic([], "Musica rimossa.");
    } catch (error: any) {
      setErr(error?.message || "Rimozione musica fallita");
    } finally {
      setMusicBusy(false);
    }
  }

  async function onGalleryRemove(index: number) {
    const attachment = data?.gallery?.[index];
    if (!attachment) return;
    if (!window.confirm(`Rimuovere “${attachment.filename || `foto ${index + 1}`}” dalla Gallery?`)) {
      return;
    }

    try {
      setGalleryBusy(true);
      setErr(null);
      setMsg(null);
      const nextGallery = (data?.gallery || []).filter((_, itemIndex) => itemIndex !== index);
      await saveGallery(nextGallery, "Foto rimossa dalla Gallery.");
    } catch (error: any) {
      setErr(error?.message || "Rimozione foto fallita");
    } finally {
      setGalleryBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--text)]"
      style={{
        ["--bg" as any]: palette.bg,
        ["--surface" as any]: palette.surface,
        ["--surface2" as any]: palette.surface2,
        ["--text" as any]: palette.text,
        ["--muted" as any]: palette.muted,
        ["--border" as any]: palette.border,
        ["--red-accent" as any]: palette.redAccent,
      }}
    >
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Admin</div>
            <h1 className="text-xl font-semibold">Modifica Experience</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Approfondimento facoltativo collegato alla scheda dell’evento.
            </p>
          </div>

          <div className="flex gap-2">
  <Link
    href="/admin/deepdive"
    className="px-4 py-2 border border-white/20 text-xs uppercase hover:border-white/40"
  >
    Indietro
  </Link>

  <button
    onClick={onSave}
    disabled={saving || galleryBusy || musicBusy}
    className="px-4 py-2 border border-white/20 text-xs uppercase hover:border-white/40"
  >
    {saving ? "Salvataggio…" : "Salva"}
  </button>
</div>



        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : err ? (
          <div className={sectionCard()}>
            <div className="text-sm text-[var(--text)]">Errore</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{err}</div>
          </div>
        ) : !data ? (
          <div className="text-sm text-[var(--muted)]">Not found.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className={sectionCard()}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Pubblicazione</div>
                    <div className="mt-1 text-sm">Se disattivata, l’Experience rimane in bozza.</div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_published)}
                      onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    />
                    Pubblicata
                  </label>
                </div>
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Contenuti principali</div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">Titolo dell’evento</div>
                  <div className={readonlyClass()}>{data.title_override || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">Titolo dell’Experience (facoltativo)</div>
                  <input
                    className={inputClass()}
                    value={form.title_deepdive || ""}
                    onChange={(e) => setForm({ ...form, title_deepdive: e.target.value })}
                    placeholder="Lascia vuoto per usare il titolo dell’evento"
                  />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">Sottotitolo o breve descrizione</div>
                  <textarea
                    className={textareaClass()}
                    value={form.subtitle || ""}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  />
                </div>
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div>
                  <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Video o immagine principale</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    È il contenuto che apre l’Experience. Il reel breve si gestisce dal pulsante “Gestisci media”.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-1">
                    <div className="text-xs text-[var(--muted)] mb-1">Tipo di contenuto</div>
                    <select
                      className={inputClass()}
                      value={form.hero_media_type || "image"}
                      onChange={(e) => setForm({ ...form, hero_media_type: e.target.value })}
                    >
                      <option value="image">Immagine</option>
                      <option value="youtube">Video YouTube</option>
                      <option value="mp4">Video MP4</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[var(--muted)] mb-1">Link YouTube</div>
                    <input
                      className={inputClass()}
                      value={form.hero_youtube_url || ""}
                      onChange={(e) => setForm({ ...form, hero_youtube_url: e.target.value })}
                      placeholder="https://youtube.com/…"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">Link video MP4</div>
                  <input
                    className={inputClass()}
                    value={form.hero_mp4_url || ""}
                    onChange={(e) => setForm({ ...form, hero_mp4_url: e.target.value })}
                    placeholder="https://…/video.mp4"
                  />
                </div>

                <div className="border-t border-white/10 pt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Gallery</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {data.gallery_count
                          ? `${data.gallery_count} immagini collegate`
                          : "Nessuna immagine collegata"}
                      </div>
                    </div>
                    <label
                      className={`px-4 py-2 border border-white/20 text-xs uppercase ${
                        galleryBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-white/40"
                      }`}
                    >
                      {galleryBusy ? "Caricamento…" : "Aggiungi foto"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={galleryBusy}
                        className="hidden"
                        onChange={(event) => {
                          void onGalleryUpload(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>

                  {data.gallery?.length ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {data.gallery.map((attachment, index) => (
                        <div key={attachment.id || attachment.url} className="border border-white/10 bg-black/30">
                          <img
                            src={attachment.url}
                            alt={attachment.filename || `Foto ${index + 1}`}
                            className="w-full aspect-square object-cover"
                          />
                          <div className="p-2">
                            <div className="text-[11px] text-white/60 truncate">
                              {attachment.filename || `Foto ${index + 1}`}
                            </div>
                            <button
                              type="button"
                              disabled={galleryBusy}
                              onClick={() => void onGalleryRemove(index)}
                              className="mt-2 text-[11px] uppercase text-red-300 hover:text-red-200 disabled:opacity-50"
                            >
                              Rimuovi
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <details className={advancedCard()}>
                <summary className="cursor-pointer list-none px-4 py-4 flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Opzioni avanzate</span>
                    <span className="mt-1 block text-sm">Racconto, atmosfera e impostazioni tecniche facoltative</span>
                  </span>
                  <span className="text-xs text-[var(--muted)]">Apri</span>
                </summary>

                <div className="border-t border-white/10 p-4 space-y-6">
                  <div className="space-y-3">
                    <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Racconto dell’evento</div>

                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Concept</div>
                      <textarea className={textareaClass()} value={form.concept || ""} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
                    </div>

                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Il luogo</div>
                      <textarea className={textareaClass()} value={form.place_story || ""} onChange={(e) => setForm({ ...form, place_story: e.target.value })} />
                    </div>

                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Lineup</div>
                      <textarea className={textareaClass()} value={form.lineup_text || ""} onChange={(e) => setForm({ ...form, lineup_text: e.target.value })} />
                    </div>

                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Invito finale</div>
                      <textarea className={textareaClass()} value={form.invite_text || ""} onChange={(e) => setForm({ ...form, invite_text: e.target.value })} />
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-5">
                    <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Atmosfera</div>
                    <SelectField label="Suono" value={form.atmosphere_sound} onChange={(v) => setForm({ ...form, atmosphere_sound: v })} options={ATMOS_SOUND_OPTIONS} />
                    <SelectField label="Luce" value={form.atmosphere_light} onChange={(v) => setForm({ ...form, atmosphere_light: v })} options={ATMOS_LIGHT_OPTIONS} />
                    <SelectField label="Energia" value={form.atmosphere_energy} onChange={(v) => setForm({ ...form, atmosphere_energy: v })} options={ATMOS_ENERGY_OPTIONS} />
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-5">
                    <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Impostazioni tecniche</div>
                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Note sul contenuto principale</div>
                      <input className={inputClass()} value={form.hero_media_note || ""} onChange={(e) => setForm({ ...form, hero_media_note: e.target.value })} />
                    </div>
                    <div>
                      <div className="text-xs text-[var(--muted)] mb-1">Note gallery</div>
                      <input className={inputClass()} value={form.gallery_note || ""} onChange={(e) => setForm({ ...form, gallery_note: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-[var(--muted)] mb-1">Ordine di visualizzazione</div>
                        <input className={inputClass()} type="number" value={form.sort_order ?? ""} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="Facoltativo" />
                      </div>
                      <div>
                        <div className="text-xs text-[var(--muted)] mb-1">Cartella Drive</div>
                        <input className={inputClass()} value={form.driver_folder_url || ""} onChange={(e) => setForm({ ...form, driver_folder_url: e.target.value })} placeholder="https://drive.google.com/…" />
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              {msg ? <div className="text-xs text-white/80">✅ {msg}</div> : null}
              {err ? <div className="text-xs text-red-400">⨯ {err}</div> : null}
            </div>

            <div className="space-y-6">
              <div className={sectionCard()}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Informazioni collegate</div>

                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--muted)]">Pulsante principale</div>
                    <div className={readonlyClass()}>{data.cta_primary_label || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-[var(--muted)]">Pulsante secondario</div>
                    <div className={readonlyClass()}>{data.cta_secondary_label || "—"}</div>
                  </div>
                </div>
              </div>

              <div className={sectionCard()}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Media</div>
                <div className="mt-3 text-sm space-y-2">
                  <div>
                    <div className="text-xs text-[var(--muted)]">Data evento</div>
                    <div className="text-white/80">{data.event_date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted)]">Audio atmosfera</div>
                    {data.music_mood?.[0] ? (
                      <div className="mt-2 space-y-2">
                        <div className="text-white/70 text-xs break-all">
                          {data.music_mood[0].filename || "Traccia MP3"}
                        </div>
                        <audio className="w-full" controls preload="metadata" src={data.music_mood[0].url}>
                          Il browser non supporta la riproduzione audio.
                        </audio>
                        <button
                          type="button"
                          disabled={musicBusy}
                          onClick={() => void onMusicRemove()}
                          className="text-[11px] uppercase text-red-300 hover:text-red-200 disabled:opacity-50"
                        >
                          Rimuovi
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1 text-white/60 text-xs">Nessun MP3 collegato</div>
                    )}
                    <label
                      className={`mt-3 inline-block px-3 py-2 border border-white/20 text-[11px] uppercase ${
                        musicBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-white/40"
                      }`}
                    >
                      {musicBusy
                        ? "Caricamento…"
                        : data.music_mood?.length
                          ? "Sostituisci MP3"
                          : "Carica MP3"}
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg"
                        disabled={musicBusy}
                        className="hidden"
                        onChange={(event) => {
                          void onMusicUpload(event.target.files?.[0] || null);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
