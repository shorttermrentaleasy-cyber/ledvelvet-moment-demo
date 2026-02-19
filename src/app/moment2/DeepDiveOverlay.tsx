/* eslint-disable @next/next/no-img-element */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AirtableAttachment = {
  url?: string;
  filename?: string;
  type?: string;
};

type DeepDive = {
  slug: string;

  title_override?: any;
  subtitle?: any;

  hero_media_type?: any; // "image" | "youtube" | "mp4"
  hero_image_url?: any;
  hero_youtube_url?: any;
  hero_mp4_url?: any;

  concept?: any;
  place_story?: any;

  atmosphere_sound?: any;
  atmosphere_light?: any;
  atmosphere_energy?: any;

  gallery_urls?: any;

  lineup_text?: any;
  invite_text?: any;

  music_mood_url?: any;
};

function getYouTubeId(urlRaw: string): string | null {
  const url = (urlRaw || "").trim();
  if (!url) return null;

  try {
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    const v = u.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p === "embed" || p === "shorts");
    if (i >= 0 && parts[i + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[i + 1])) return parts[i + 1];

    const token = parts.find((p) => /^[a-zA-Z0-9_-]{11}$/.test(p));
    return token || null;
  } catch {
    return null;
  }
}

function ytEmbed(url: string) {
  const id = getYouTubeId(url);
  if (!id) return "";
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
}

function asString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (Array.isArray(v)) return asString(v[0]);
  if (typeof v === "object") return asString(v.name ?? v.value ?? v.slug ?? v.url ?? v.id);
  return String(v).trim();
}

function asUrl(v: any): string {
  const s = asString(v);
  if (s && /^https?:\/\//i.test(s)) return s;

  if (Array.isArray(v)) {
    const first = v.find(Boolean);
    return asUrl(first);
  }
  if (v && typeof v === "object") {
    const u = asString((v as AirtableAttachment).url);
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return s;
}

function asUrlArray(v: any): string[] {
  if (!v) return [];
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    if (s.includes("\n") || s.includes(",")) {
      return s
        .split(/[\n,]/g)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [s];
  }

  if (Array.isArray(v)) {
    return v
      .map((x) => asUrl(x))
      .map((x) => x.trim())
      .filter(Boolean);
  }

  if (typeof v === "object") {
    const u = asUrl(v);
    return u ? [u] : [];
  }

  return [];
}

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    if (s.includes("\n") || s.includes(",")) {
      return s
        .split(/[\n,]/g)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [s];
  }
  if (Array.isArray(v)) {
    return v
      .map((x) => asString(x))
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (typeof v === "object") {
    const s = asString(v);
    return s ? [s] : [];
  }
  return [];
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "sound" | "light" | "energy" }) {
  const cls =
    tone === "sound"
      ? "border-[var(--red-acc)]/50 bg-[var(--red-acc)]/12 text-white"
      : tone === "energy"
      ? "border-red-200/35 bg-red-200/10 text-red-50"
      : "border-white/20 bg-white/5 text-white/85";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] tracking-[0.18em] uppercase",
        "hover:bg-white/10 transition",
        cls,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function SectionCard({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 overflow-x-hidden">
      <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">{label}</div>
      {title ? <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3> : null}
      <div className="mt-4 text-white/85 leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
        {children}
      </div>
    </article>
  );
}

export default function DeepDiveOverlay({
  slug,
  onClose,
  ticketUrl,
  city,
  dateLabel,
}: {
  slug: string | null;
  onClose: () => void;
  ticketUrl?: string;
  city?: string;
  dateLabel?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DeepDive | null>(null);

  const moodAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMoodPlaying, setIsMoodPlaying] = useState(false);

  const [returnTo, setReturnTo] = useState<string>("");

  // ✅ gallery lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const stopMood = useCallback(() => {
    const el = moodAudioRef.current;
    if (!el) return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch {}
    setIsMoodPlaying(false);
  }, []);

  const toggleMood = useCallback(() => {
    const el = moodAudioRef.current;
    if (!el) return;

    if (isMoodPlaying) {
      stopMood();
      return;
    }

    el.play()
      .then(() => setIsMoodPlaying(true))
      .catch(() => {});
  }, [isMoodPlaying, stopMood]);

  const handleClose = useCallback(() => {
    stopMood();
    onClose();
  }, [onClose, stopMood]);

  const open = !!slug;

  // lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // esc close (overlay)
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (lightboxOpen) {
          setLightboxOpen(false);
          return;
        }
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose, lightboxOpen]);

  // build returnTo with experience param
  useEffect(() => {
    if (!open || !slug) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("experience", String(slug));
      setReturnTo(u.pathname + "?" + u.searchParams.toString() + (u.hash || ""));
    } catch {
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
    }
  }, [open, slug]);

  const lvPeopleHref = useMemo(() => {
    if (!returnTo) return "/society";
    return `/society?from=${encodeURIComponent(returnTo)}`;
  }, [returnTo]);

  const slugToString = useCallback((v: any): string => {
    if (!v) return "";
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return slugToString(v[0]);
    if (typeof v === "object") return slugToString(v.slug ?? v.value ?? v.name ?? v.id);
    return String(v).trim();
  }, []);

  // load deepdive
  useEffect(() => {
    const slugStr = slugToString(slug);
    if (!open || !slugStr) return;

    let alive = true;
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(`/api/public/deepdive?slug=${encodeURIComponent(slugStr)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok || !j?.ok) throw new Error(j?.error || "Errore caricamento deep dive");
        setData(j.deepdive);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.message || "Errore");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, slug, slugToString]);

  // stop mood when slug changes / close
  useEffect(() => {
    if (!open) return;
    stopMood();
  }, [slug, open, stopMood]);

  // ✅ close lightbox on slug change / close
  useEffect(() => {
    if (!open) return;
    setLightboxOpen(false);
    setLightboxIndex(0);
  }, [open, slug]);

  const title = useMemo(() => {
    const t = asString(data?.title_override);
    return t ? t : "Led Velvet Event";
  }, [data]);

  const subtitle = asString(data?.subtitle);

  const heroTypeRaw = asString(data?.hero_media_type).toLowerCase();
  const heroType: "image" | "youtube" | "mp4" =
    heroTypeRaw === "youtube" ? "youtube" : heroTypeRaw === "mp4" ? "mp4" : "image";

  const heroYouTube = ytEmbed(asString(data?.hero_youtube_url));
  const heroMp4 = asUrl(data?.hero_mp4_url);
  const heroImg = asUrl(data?.hero_image_url);

  const moodTrackUrl = asUrl(data?.music_mood_url);

  const sound = asStringArray(data?.atmosphere_sound);
  const light = asStringArray(data?.atmosphere_light);
  const energy = asStringArray(data?.atmosphere_energy);
  const showAtmos = !!(sound.length || light.length || energy.length);

  const gallery = asUrlArray(data?.gallery_urls);

  const concept = asString(data?.concept);
  const placeStory = asString(data?.place_story);
  const lineup = asString(data?.lineup_text);
  const invite = asString(data?.invite_text);

  const openLightbox = useCallback((idx: number) => {
    setLightboxIndex(Math.max(0, idx));
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const nextImg = useCallback(() => {
    if (!gallery?.length) return;
    setLightboxIndex((i) => (i + 1) % gallery.length);
  }, [gallery]);

  const prevImg = useCallback(() => {
    if (!gallery?.length) return;
    setLightboxIndex((i) => (i - 1 + gallery.length) % gallery.length);
  }, [gallery]);

  // ✅ arrow navigation in lightbox
  useEffect(() => {
    if (!open || !lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nextImg();
      if (e.key === "ArrowLeft") prevImg();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lightboxOpen, nextImg, prevImg]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] overflow-hidden" style={{ ["--red-acc" as any]: "#930b0c" }}>
      <div className="absolute inset-0 bg-black/85" onClick={handleClose} aria-hidden="true" />

      <div className="absolute inset-0 flex justify-center overflow-hidden">
        <div className="relative w-full max-w-5xl h-full bg-[#0B0B0C] overflow-hidden">
          <div className="sticky top-0 z-10 border-b border-[var(--red-acc)]/30 bg-[#0B0B0C]">
            <div className="px-6 py-4 flex items-center justify-between gap-4 min-w-0">
              <div className="min-w-0">
                <div className="text-[11px] tracking-[0.22em] uppercase text-white/60 break-words [overflow-wrap:anywhere]">
                  {city ? city : "Led Velvet"} {dateLabel ? `• ${dateLabel}` : ""}
                </div>
                <div className="text-sm md:text-base font-medium text-white truncate">{title}</div>
              </div>

              <div className="flex items-center gap-2 flex-none">
                {ticketUrl ? (
                  <a
                    href={ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-[var(--red-acc)] text-black text-xs tracking-[0.18em] uppercase hover:opacity-90"
                  >
                    Book
                  </a>
                ) : null}

                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-white/10 border border-white/20 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/15 hover:border-white/35"
                >
                  ✕ Close
                </button>
              </div>
            </div>
          </div>

          <div className="h-[calc(100%-60px)] overflow-y-auto overflow-x-hidden pb-28">
            <div className="px-6 py-8 overflow-x-hidden">
              {loading ? (
                <div className="text-white/70">Caricamento…</div>
              ) : err ? (
                <div className="text-red-300 break-words [overflow-wrap:anywhere]">{err}</div>
              ) : data ? (
                <div className="grid gap-6 md:grid-cols-2 md:items-center min-w-0">
                  <div className="min-w-0">
                    <h1 className="text-4xl md:text-5xl font-semibold leading-tight break-words [overflow-wrap:anywhere]">
                      {title}
                    </h1>

                    {subtitle ? (
                      <p className="mt-4 max-w-xl text-base md:text-lg text-white/80 whitespace-pre-line break-words [overflow-wrap:anywhere]">
                        {subtitle}
                      </p>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-3">
                      <a
                        href={lvPeopleHref}
                        className="inline-flex items-center rounded-full border border-[var(--red-acc)]/40 bg-[var(--red-acc)]/10 px-4 py-2 text-xs tracking-[0.18em] uppercase text-white/90 hover:bg-[var(--red-acc)]/15 hover:border-[var(--red-acc)]/60"
                      >
                        LV PEOPLE
                      </a>

                      {ticketUrl ? (
                        <a
                          href={ticketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full bg-[var(--red-acc)] px-4 py-2 text-xs tracking-[0.18em] uppercase text-black hover:opacity-90"
                        >
                          Book
                        </a>
                      ) : null}
                    </div>

                    {moodTrackUrl ? (
                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={toggleMood}
                          className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs tracking-[0.18em] uppercase text-white/85 hover:bg-white/10"
                        >
                          {isMoodPlaying ? "■ Stop Mood" : "▶ Play Mood"}
                        </button>

                        <span className="text-[11px] tracking-[0.18em] uppercase text-white/50">Led Velvet Mood</span>

                        <audio ref={moodAudioRef} src={moodTrackUrl} preload="none" onEnded={() => setIsMoodPlaying(false)} />
                      </div>
                    ) : null}

                    {showAtmos ? (
                      <div className="mt-8">
                        <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Atmosphere</div>

                        {sound.length ? (
                          <div className="mt-3">
                            <div className="text-[10px] tracking-[0.26em] uppercase text-white/50">Sound</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {sound.map((t, i) => (
                                <Pill key={`sound-${i}`} tone="sound">
                                  {t}
                                </Pill>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {light.length ? (
                          <div className="mt-4">
                            <div className="text-[10px] tracking-[0.26em] uppercase text-white/50">Light</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {light.map((t, i) => (
                                <Pill key={`light-${i}`} tone="light">
                                  {t}
                                </Pill>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {energy.length ? (
                          <div className="mt-4">
                            <div className="text-[10px] tracking-[0.26em] uppercase text-white/50">Energy</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {energy.map((t, i) => (
                                <Pill key={`energy-${i}`} tone="energy">
                                  {t}
                                </Pill>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden min-w-0">
                    {heroType === "youtube" && heroYouTube ? (
                      <iframe
                        className="w-full aspect-video"
                        src={heroYouTube}
                        title="Hero video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    ) : heroType === "mp4" && heroMp4 ? (
                      <video className="w-full aspect-video object-cover" src={heroMp4} autoPlay muted loop playsInline />
                    ) : heroImg ? (
                      <img src={heroImg} alt={title} className="w-full aspect-video object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-video bg-black/40" />
                    )}
                  </div>
                </div>
              ) : null}

              {data ? (
                <section className="mt-10 grid gap-8 overflow-x-hidden">
                  {concept ? <SectionCard label="Concept">{concept}</SectionCard> : null}
                  {placeStory ? <SectionCard label="Luogo">{placeStory}</SectionCard> : null}
                  {lineup ? <SectionCard label="Line-up">{lineup}</SectionCard> : null}

                  {gallery?.length ? (
                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 overflow-x-hidden">
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Gallery</div>
                        <div className="text-[11px] tracking-[0.18em] uppercase text-white/40 flex-none">
                          {gallery.length} shots
                        </div>
                      </div>

                      <div
                        className={[
                          "mt-4 flex gap-3 overflow-x-auto overflow-y-hidden pb-2",
                          "snap-x snap-mandatory",
                          "overscroll-x-contain",
                        ].join(" ")}
                        style={{
                          WebkitOverflowScrolling: "touch",
                          touchAction: "pan-x",
                        }}
                      >
                        {gallery.map((url, i) => (
                          <button
                            key={`g-${i}`}
                            type="button"
                            onClick={() => openLightbox(i)}
                            className={[
                              "group relative flex-none snap-start overflow-hidden rounded-xl border border-white/10 bg-black/20",
                              "focus:outline-none focus:ring-2 focus:ring-[var(--red-acc)]/60",
                              "w-60 h-40 md:w-72 md:h-48",
                            ].join(" ")}
                            aria-label={`Apri immagine ${i + 1} di ${gallery.length}`}
                          >
                            <img
                              src={url}
                              alt={`Gallery ${i + 1}`}
                              className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.03] group-hover:opacity-95"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                              <span className="text-[10px] tracking-[0.22em] uppercase text-white/80">Shot {i + 1}</span>
                              <span className="text-[10px] tracking-[0.22em] uppercase text-white/80">View</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  {invite ? <SectionCard label="Invito">{invite}</SectionCard> : null}

                  {/* ✅ BACK in fondo (leggero) */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-full md:w-auto px-6 py-3 rounded-full border border-white/20 bg-white/5 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/35"
                    >
                      ← Torna indietro
                    </button>
                  </div>

                  <div className="h-16" />
                </section>
              ) : null}
            </div>
          </div>

          {/* ✅ Lightbox */}
          {lightboxOpen && gallery?.length ? (
            <div className="fixed inset-0 z-[1000]">
              <div className="absolute inset-0 bg-black/90" onClick={closeLightbox} aria-hidden="true" />

              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  className="relative w-full max-w-5xl"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Gallery lightbox"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    <img
                      src={gallery[lightboxIndex]}
                      alt={`Gallery ${lightboxIndex + 1}`}
                      className="w-full max-h-[78vh] object-contain bg-black/40"
                      loading="eager"
                    />

                    {/* ✅ NEW: CONTROLS MINIMI, MOLTO IN BASSO (solo ‹ › ✕) */}
                    <div
                      className="absolute inset-x-0 bottom-0"
                      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
                    >
                      <div className="px-4 pb-2">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={prevImg}
                            disabled={gallery.length <= 1}
                            className={[
                              "w-12 h-12 rounded-full border grid place-items-center text-white",
                              gallery.length > 1
                                ? "bg-black/35 border-white/25 hover:bg-black/45 hover:border-white/40"
                                : "bg-black/20 border-white/10 text-white/30 cursor-not-allowed",
                            ].join(" ")}
                            aria-label="Immagine precedente"
                            title="Prev"
                          >
                            ‹
                          </button>

                          <button
                            type="button"
                            onClick={closeLightbox}
                            className="w-12 h-12 rounded-full border border-white/25 bg-black/35 grid place-items-center text-white hover:bg-black/45 hover:border-white/40"
                            aria-label="Chiudi"
                            title="Close"
                          >
                            ✕
                          </button>

                          <button
                            type="button"
                            onClick={nextImg}
                            disabled={gallery.length <= 1}
                            className={[
                              "w-12 h-12 rounded-full border grid place-items-center text-white",
                              gallery.length > 1
                                ? "bg-black/35 border-white/25 hover:bg-black/45 hover:border-white/40"
                                : "bg-black/20 border-white/10 text-white/30 cursor-not-allowed",
                            ].join(" ")}
                            aria-label="Immagine successiva"
                            title="Next"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* (TIP rimosso) */}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}