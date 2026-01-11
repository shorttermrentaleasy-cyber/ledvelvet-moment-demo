"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

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
  gallery_count: number;
  music_mood_url: string;
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
      {options.length === 0 ? (
        <div className="mt-1 text-[11px] text-white/50">
          (Aggiungi le opzioni negli array in cima al file: ATMOS_*_OPTIONS)
        </div>
      ) : null}
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
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Cannot load deepdive");

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
            <h1 className="text-xl font-semibold">Edit DeepDive</h1>
            <p className="mt-1 text-xs text-[var(--muted)] font-mono">{String(slug)}</p>
          </div>

          <div className="flex gap-2">
  <Link
    href="/admin/deepdive"
    className="px-4 py-2 border border-white/20 text-xs uppercase hover:border-white/40"
  >
    Back
  </Link>

  <a
    href="https://airtable.com/appkpUBdMSN1oY4TI/pagDDuGezzbamb7IP"
    target="_blank"
    rel="noopener noreferrer"
    className="px-4 py-2 border border-white/20 text-xs uppercase hover:border-white/40"
  >
    Media Manager
  </a>

  <button
    onClick={onSave}
    className="px-4 py-2 border border-white/20 text-xs uppercase hover:border-white/40"
  >
    Save
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
                    <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Status</div>
                    <div className="mt-1 text-sm">Online solo se Published ✅</div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_published)}
                      onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    />
                    Published
                  </label>
                </div>
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Titles</div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">Title override (readonly)</div>
                  <div className={readonlyClass()}>{data.title_override || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">DeepDive title (editable, optional)</div>
                  <input
                    className={inputClass()}
                    value={form.title_deepdive || ""}
                    onChange={(e) => setForm({ ...form, title_deepdive: e.target.value })}
                    placeholder="(optional)"
                  />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">Subtitle (Experience description)</div>
                  <textarea
                    className={textareaClass()}
                    value={form.subtitle || ""}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  />
                </div>
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Atmosphere (single select)</div>

                <SelectField
                  label="atmosphere_sound"
                  value={form.atmosphere_sound}
                  onChange={(v) => setForm({ ...form, atmosphere_sound: v })}
                  options={ATMOS_SOUND_OPTIONS}
                />

                <SelectField
                  label="atmosphere_light"
                  value={form.atmosphere_light}
                  onChange={(v) => setForm({ ...form, atmosphere_light: v })}
                  options={ATMOS_LIGHT_OPTIONS}
                />

                <SelectField
                  label="atmosphere_energy"
                  value={form.atmosphere_energy}
                  onChange={(v) => setForm({ ...form, atmosphere_energy: v })}
                  options={ATMOS_ENERGY_OPTIONS}
                />
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Hero</div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-1">
                    <div className="text-xs text-[var(--muted)] mb-1">hero_media_type</div>
                    <select
                      className={inputClass()}
                      value={form.hero_media_type || "image"}
                      onChange={(e) => setForm({ ...form, hero_media_type: e.target.value })}
                    >
                      <option value="image">image</option>
                      <option value="youtube">youtube</option>
                      <option value="mp4">mp4</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[var(--muted)] mb-1">hero_youtube_url</div>
                    <input
                      className={inputClass()}
                      value={form.hero_youtube_url || ""}
                      onChange={(e) => setForm({ ...form, hero_youtube_url: e.target.value })}
                      placeholder="https://youtube.com/…"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">hero_mp4_url</div>
                  <input
                    className={inputClass()}
                    value={form.hero_mp4_url || ""}
                    onChange={(e) => setForm({ ...form, hero_mp4_url: e.target.value })}
                    placeholder="https://…/video.mp4"
                  />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">hero_media_note</div>
                  <input
                    className={inputClass()}
                    value={form.hero_media_note || ""}
                    onChange={(e) => setForm({ ...form, hero_media_note: e.target.value })}
                  />
                </div>

                <div className="text-xs text-[var(--muted)]">
                  Attachments gestiti in Airtable.
                  <div className="mt-1 text-white/70 break-all">hero_image url: {data.hero_image_url || "—"}</div>
                  <div className="mt-1 text-white/70">gallery count: {data.gallery_count ?? 0}</div>
                </div>
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Content</div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">concept</div>
                  <textarea className={textareaClass()} value={form.concept || ""} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">place_story</div>
                  <textarea
                    className={textareaClass()}
                    value={form.place_story || ""}
                    onChange={(e) => setForm({ ...form, place_story: e.target.value })}
                  />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">lineup_text</div>
                  <textarea
                    className={textareaClass()}
                    value={form.lineup_text || ""}
                    onChange={(e) => setForm({ ...form, lineup_text: e.target.value })}
                  />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">invite_text</div>
                  <textarea
                    className={textareaClass()}
                    value={form.invite_text || ""}
                    onChange={(e) => setForm({ ...form, invite_text: e.target.value })}
                  />
                </div>

                <div>
                  <div className="text-xs text-[var(--muted)] mb-1">gallery_note</div>
                  <input
                    className={inputClass()}
                    value={form.gallery_note || ""}
                    onChange={(e) => setForm({ ...form, gallery_note: e.target.value })}
                  />
                </div>
              </div>

              <div className={sectionCard() + " space-y-3"}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Meta</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">sort_order</div>
                    <input
                      className={inputClass()}
                      type="number"
                      value={form.sort_order ?? ""}
                      onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                      placeholder="(optional)"
                    />
                  </div>

                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">driver_folder_url</div>
                    <input
                      className={inputClass()}
                      value={form.driver_folder_url || ""}
                      onChange={(e) => setForm({ ...form, driver_folder_url: e.target.value })}
                      placeholder="https://drive.google.com/…"
                    />
                  </div>
                </div>

                {msg ? <div className="text-xs text-white/80">✅ {msg}</div> : null}
                {err ? <div className="text-xs text-red-400">⨯ {err}</div> : null}
              </div>
            </div>

            <div className="space-y-6">
              <div className={sectionCard()}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Readonly (for now)</div>

                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--muted)]">cta_primary_label (from events later)</div>
                    <div className={readonlyClass()}>{data.cta_primary_label || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-[var(--muted)]">cta_secondary_label</div>
                    <div className={readonlyClass()}>{data.cta_secondary_label || "—"}</div>
                  </div>
                </div>
              </div>

              <div className={sectionCard()}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Media</div>
                <div className="mt-3 text-sm space-y-2">
                  <div>
                    <div className="text-xs text-[var(--muted)]">event_date</div>
                    <div className="text-white/80">{data.event_date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted)]">music_mood url</div>
                    <div className="text-white/70 text-xs break-all">{data.music_mood_url || "—"}</div>
                  </div>
                </div>
              </div>

              <div className={sectionCard()}>
                <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Note</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Per evitare errori di “opzione non valida”, le opzioni dei select stanno nel codice (array ATMOS_*_OPTIONS).
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
