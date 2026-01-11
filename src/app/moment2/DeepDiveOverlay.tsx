"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DeepDive = {
  slug: string;

  title_override: string;
  subtitle: string;

  hero_media_type: "image" | "youtube" | "mp4";
  hero_image_url: string;
  hero_youtube_url: string;
  hero_mp4_url: string;

  concept: string;
  place_story?: string;

  atmosphere_sound: string[];
  atmosphere_light: string[];
  atmosphere_energy: string[];

  gallery_urls: string[];

  lineup_text: string;
  invite_text: string;

  // mp3 attachment (url)
  music_mood_url?: string;
};

function ytEmbed(url: string) {
  const u = (url || "").trim();
  if (!u) return "";
  let id = "";
  if (u.includes("watch?v=")) id = u.split("watch?v=")[1]?.split("&")[0] || "";
  else if (u.includes("youtu.be/")) id = u.split("youtu.be/")[1]?.split("?")[0] || "";
  else if (u.includes("youtube.com/shorts/")) id = u.split("youtube.com/shorts/")[1]?.split("?")[0] || "";
  if (!id) return "";
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "sound" | "light" | "energy";
}) {
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

function SectionCard({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">{label}</div>
      {title ? <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3> : null}
      <div className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">{children}</div>
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

  // Mood audio
  const moodAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMoodPlaying, setIsMoodPlaying] = useState(false);

  // where we came from (keeps experience param)
  const [returnTo, setReturnTo] = useState<string>("");

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
      .catch(() => {
        // autoplay policies or errors: fail silently
      });
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

  // esc close
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  // build returnTo with experience param
  useEffect(() => {
    if (!open || !slug) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("experience", slug);
      setReturnTo(u.pathname + "?" + u.searchParams.toString() + (u.hash || ""));
    } catch {
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
    }
  }, [open, slug]);

  const lvPeopleHref = useMemo(() => {
    if (!returnTo) return "/society";
    return `/society?from=${encodeURIComponent(returnTo)}`;
  }, [returnTo]);

  // load deepdive
  useEffect(() => {
    if (!open || !slug) return;

    let alive = true;
    setLoading(true);
    setErr(null);
    setData(null);

    fetch(`/api/public/deepdive?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
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
  }, [open, slug]);

  // stop mood when slug changes
  useEffect(() => {
    if (!open) return;
    stopMood();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, open]);

  const title = useMemo(() => (data?.title_override ? data.title_override : "Led Velvet Event"), [data]);

  const subtitle = data?.subtitle || "";
  const heroType = data?.hero_media_type || "image";
  const heroYouTube = ytEmbed(data?.hero_youtube_url || "");
  const heroMp4 = (data?.hero_mp4_url || "").trim();
  const heroImg = (data?.hero_image_url || "").trim();

  const moodTrackUrl = (data?.music_mood_url || "").trim();

  const sound = data?.atmosphere_sound || [];
  const light = data?.atmosphere_light || [];
  const energy = data?.atmosphere_energy || [];
  const showAtmos = sound.length || light.length || energy.length;

  const gallery = data?.gallery_urls || [];

  const concept = data?.concept || "";
  const placeStory = data?.place_story || "";
  const lineup = data?.lineup_text || "";
  const invite = data?.invite_text || "";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/85" onClick={handleClose} aria-hidden="true" />

      {/* panel */}
      <div className="absolute inset-0 flex justify-center">
        <div className="relative w-full max-w-5xl h-full bg-[#0B0B0C]">
          {/* header sticky */}
          <div className="sticky top-0 z-10 border-b border-[var(--red-acc)]/30 bg-[#0B0B0C]">
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] tracking-[0.22em] uppercase text-white/60">
                  {city ? city : "Led Velvet"} {dateLabel ? `• ${dateLabel}` : ""}
                </div>
                <div className="text-sm md:text-base font-medium text-white truncate">{title}</div>
              </div>

              <div className="flex items-center gap-2">
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

          {/* body */}
          <div className="h-[calc(100%-60px)] overflow-y-auto">
            <div className="px-6 py-8">
              {loading ? (
                <div className="text-white/70">Caricamento…</div>
              ) : err ? (
                <div className="text-red-300">{err}</div>
              ) : data ? (
                <div className="grid gap-6 md:grid-cols-2 md:items-center">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-semibold leading-tight">{title}</h1>

                    {subtitle ? (
                      <p className="mt-4 max-w-xl text-base md:text-lg text-white/80 whitespace-pre-line">{subtitle}</p>
                    ) : null}

                    {/* CTA row */}
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

                    {/* Mood Sound */}
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

                    {/* Atmosphere (color-coded) */}
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

                  {/* hero media */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    {heroType === "youtube" && heroYouTube ? (
                      <iframe
                        className="w-full aspect-video"
                        src={heroYouTube}
                        title="Hero video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
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

              {/* content sections */}
              {data ? (
                <section className="mt-10 grid gap-8">
                  {concept ? <SectionCard label="Concept">{concept}</SectionCard> : null}

                  {placeStory ? <SectionCard label="Luogo">{placeStory}</SectionCard> : null}

                  {lineup ? <SectionCard label="Line-up">{lineup}</SectionCard> : null}

                  {gallery?.length ? (
                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
                      <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Gallery</div>
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        {gallery.map((url, i) => (
                          <img
                            key={`g-${i}`}
                            src={url}
                            alt={`Gallery ${i + 1}`}
                            className="w-full h-44 object-cover rounded-xl border border-white/10"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </article>
                  ) : null}

                  {invite ? <SectionCard label="Invito">{invite}</SectionCard> : null}

                  <div className="h-16" />
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
