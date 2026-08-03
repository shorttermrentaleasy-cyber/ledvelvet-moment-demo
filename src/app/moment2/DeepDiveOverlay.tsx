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
  lineup_video_url?: any;
  invite_text?: any;

  music_mood_url?: any;
};

type YouTubePlayer = {
  destroy: () => void;
  mute: () => void;
  playVideo: () => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
  data?: number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLIFrameElement,
        options: {
          events: {
            onReady: (event: YouTubePlayerEvent) => void;
            onStateChange: (event: YouTubePlayerEvent) => void;
            onAutoplayBlocked: () => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState?: {
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("YouTube API unavailable")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener("error", () => reject(new Error("YouTube API unavailable")), { once: true });
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

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
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;
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
    <article className="relative overflow-x-hidden border-l border-[var(--red-acc)]/70 pl-5 md:pl-8">
      <div className="text-[10px] font-medium tracking-[0.34em] uppercase text-[var(--red-light)]">{label}</div>
      {title ? <h3 className="mt-3 text-2xl font-semibold text-white">{title}</h3> : null}
      <div className="mt-4 max-w-3xl text-base leading-8 text-white/75 whitespace-pre-line break-words [overflow-wrap:anywhere] md:text-lg">
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
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const lineupVideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const [isMoodPlaying, setIsMoodPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const [returnTo, setReturnTo] = useState<string>("");

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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    stopMood();
  }, [slug, open, stopMood]);

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
  const lineupVideo = asUrl(data?.lineup_video_url);
  const invite = asString(data?.invite_text);

  const playMutedVideo = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    void video
      .play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => setAutoplayBlocked(true));
  }, []);

  useEffect(() => {
    if (!open || heroType !== "youtube" || !heroYouTube || !youtubeIframeRef.current) return;

    let alive = true;
    let player: YouTubePlayer | null = null;

    void loadYouTubeApi()
      .then(() => {
        if (!alive || !window.YT?.Player || !youtubeIframeRef.current) return;

        player = new window.YT.Player(youtubeIframeRef.current, {
          events: {
            onReady: (event) => {
              if (!alive) return;
              event.target.mute();
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (!alive) return;
              if (event.data === window.YT?.PlayerState?.PLAYING) setAutoplayBlocked(false);
            },
            onAutoplayBlocked: () => {
              if (alive) setAutoplayBlocked(true);
            },
          },
        });
        youtubePlayerRef.current = player;
      })
      .catch(() => {
        if (alive) setAutoplayBlocked(true);
      });

    return () => {
      alive = false;
      if (youtubePlayerRef.current === player) youtubePlayerRef.current = null;
      try {
        player?.destroy();
      } catch {}
    };
  }, [heroType, heroYouTube, open, slug]);

  useEffect(() => {
    if (!open) setAutoplayBlocked(false);
  }, [open, slug]);

  const startVisibleMedia = useCallback(() => {
    const youtubePlayer = youtubePlayerRef.current;
    if (youtubePlayer) {
      youtubePlayer.mute();
      youtubePlayer.playVideo();
    }

    [heroVideoRef.current, lineupVideoRef.current].forEach((video) => {
      if (!video) return;
      const rect = video.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) playMutedVideo(video);
    });

    setAutoplayBlocked(false);
  }, [playMutedVideo]);

  useEffect(() => {
    if (!open || !data) return;

    const videos = [heroVideoRef.current, lineupVideoRef.current].filter(
      (video): video is HTMLVideoElement => Boolean(video),
    );
    if (!videos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            playMutedVideo(video);
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.05 },
    );

    videos.forEach((video) => {
      observer.observe(video);
      if (video.getBoundingClientRect().top < window.innerHeight) playMutedVideo(video);
    });

    const resumeVisibleVideos = () => {
      if (document.visibilityState !== "visible") return;
      videos.forEach((video) => {
        const rect = video.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) playMutedVideo(video);
      });
    };

    document.addEventListener("visibilitychange", resumeVisibleVideos);
    window.addEventListener("pageshow", resumeVisibleVideos);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", resumeVisibleVideos);
      window.removeEventListener("pageshow", resumeVisibleVideos);
    };
  }, [data, heroMp4, lineupVideo, open, playMutedVideo]);

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
    <div
      className="fixed inset-0 z-[999] overflow-hidden bg-black"
      style={{
        ["--red-acc" as any]: "#930b0c",
        ["--red-light" as any]: "#ff4b4e",
      }}
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(147,11,12,0.26),transparent_42%),#020202]"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex items-center justify-center md:p-5">
        <div className="relative h-full w-full max-w-7xl overflow-hidden bg-[#070708] shadow-[0_30px_120px_rgba(0,0,0,0.9)] md:h-[calc(100vh-40px)] md:rounded-[28px] md:border md:border-white/10">
          <header className="absolute inset-x-0 top-0 z-40">
            <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-7">
              <div className="min-w-0 rounded-full border border-white/10 bg-black/35 px-4 py-2 backdrop-blur-xl">
                <div className="truncate text-[9px] font-medium tracking-[0.3em] uppercase text-white/55">
                  LEDVELVET · EXPERIENCE
                </div>
              </div>

              <div className="flex flex-none items-center gap-2">
                {ticketUrl ? (
                  <a
                    href={ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden rounded-full bg-[var(--red-acc)] px-4 py-2.5 text-[10px] font-semibold tracking-[0.2em] uppercase text-white transition hover:bg-red-700 sm:inline-flex"
                  >
                    Acquista
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={handleClose}
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/45 text-lg text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/15"
                  aria-label="Chiudi Experience"
                  title="Chiudi"
                >
                  ✕
                </button>
              </div>
            </div>
          </header>

          <div className="experience-scrollbar h-full overflow-y-auto overflow-x-hidden bg-[#070708]">
            {loading ? (
              <div className="grid min-h-full place-items-center px-6 text-sm tracking-[0.2em] uppercase text-white/55">
                Caricamento Experience…
              </div>
            ) : err ? (
              <div className="grid min-h-full place-items-center px-6 text-center text-red-300">
                {err}
              </div>
            ) : data ? (
              <>
                <section className="relative flex min-h-[86svh] items-end overflow-hidden md:min-h-[720px]">
                  <div className="absolute inset-0 bg-black">
                    {heroType === "youtube" && heroYouTube ? (
                      <iframe
                        ref={youtubeIframeRef}
                        key={`${slug}-${heroYouTube}`}
                        className="h-full w-full"
                        src={heroYouTube}
                        title={`${title} – aftermovie`}
                        loading="eager"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    ) : heroType === "mp4" && heroMp4 ? (
                      <video
                        ref={heroVideoRef}
                        className="h-full w-full object-cover"
                        src={heroMp4}
                        autoPlay
                        muted
                        loop
                        playsInline
                        controls
                        preload="auto"
                        onCanPlay={(event) => playMutedVideo(event.currentTarget)}
                      />
                    ) : heroImg ? (
                      <img
                        src={heroImg}
                        alt={title}
                        className="h-full w-full object-cover"
                        loading="eager"
                      />
                    ) : (
                      <div className="h-full w-full bg-[radial-gradient(circle_at_70%_25%,rgba(147,11,12,0.45),transparent_34%),linear-gradient(145deg,#171719,#020202_65%)]" />
                    )}
                  </div>

                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.06)_34%,rgba(0,0,0,0.93)_100%)]" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_20%_100%,rgba(147,11,12,0.34),transparent_56%)]" />

                  <div className="relative z-10 w-full px-5 pb-12 pt-32 md:px-12 md:pb-16 lg:px-16">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-medium tracking-[0.3em] uppercase text-white/65 md:text-xs">
                      {dateLabel ? <span>{dateLabel}</span> : null}
                      {dateLabel && city ? (
                        <span className="h-1 w-1 rounded-full bg-[var(--red-light)]" />
                      ) : null}
                      {city ? <span>{city}</span> : null}
                    </div>

                    <h1 className="mt-5 max-w-5xl break-words text-[clamp(2.8rem,9vw,7.5rem)] font-black leading-[0.84] tracking-[-0.055em] text-white [overflow-wrap:anywhere]">
                      {title}
                    </h1>

                    {subtitle ? (
                      <p className="mt-6 max-w-2xl whitespace-pre-line text-base leading-7 text-white/75 md:text-xl md:leading-8">
                        {subtitle}
                      </p>
                    ) : null}

                    <div className="mt-7 flex flex-wrap items-center gap-3">
                      {moodTrackUrl ? (
                        <button
                          type="button"
                          onClick={toggleMood}
                          className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-[10px] font-semibold tracking-[0.22em] uppercase text-white backdrop-blur-xl transition hover:bg-white/20"
                        >
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--red-acc)] text-[9px]">
                            {isMoodPlaying ? "■" : "▶"}
                          </span>
                          {isMoodPlaying ? "Stop mood" : "Play mood"}
                        </button>
                      ) : null}

                      <a
                        href={lvPeopleHref}
                        className="pointer-events-auto inline-flex rounded-full border border-white/20 bg-black/25 px-5 py-3 text-[10px] font-semibold tracking-[0.22em] uppercase text-white/85 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/10"
                      >
                        LV PEOPLE
                      </a>

                      {ticketUrl ? (
                        <a
                          href={ticketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="pointer-events-auto inline-flex rounded-full bg-[var(--red-acc)] px-5 py-3 text-[10px] font-semibold tracking-[0.22em] uppercase text-white transition hover:bg-red-700 sm:hidden"
                        >
                          Acquista
                        </a>
                      ) : null}
                    </div>

                    {moodTrackUrl ? (
                      <audio
                        ref={moodAudioRef}
                        src={moodTrackUrl}
                        preload="none"
                        onEnded={() => setIsMoodPlaying(false)}
                      />
                    ) : null}
                  </div>
                </section>

                <main className="relative">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_65%_0%,rgba(147,11,12,0.16),transparent_64%)]" />

                  <div className="relative mx-auto max-w-6xl space-y-20 px-5 py-16 md:space-y-28 md:px-10 md:py-24">
                    {concept || placeStory ? (
                      <section className="grid gap-12 md:grid-cols-2 md:gap-16">
                        {concept ? (
                          <SectionCard label="Concept">{concept}</SectionCard>
                        ) : null}
                        {placeStory ? (
                          <SectionCard label="Il luogo">
                            {placeStory}
                          </SectionCard>
                        ) : null}
                      </section>
                    ) : null}

                    {lineup || lineupVideo ? (
                      <section className="relative overflow-hidden border-y border-white/10 py-12 md:py-20">
                        <div className="absolute -right-16 top-4 select-none text-[8rem] font-black leading-none text-white/[0.025] md:text-[15rem]">
                          LIVE
                        </div>
                        <div
                          className={
                            lineup && lineupVideo
                              ? "grid items-center gap-10 md:grid-cols-[1.15fr_0.85fr] md:gap-16"
                              : ""
                          }
                        >
                          {lineup ? (
                            <div className="relative z-10">
                              <div className="text-[10px] font-semibold tracking-[0.38em] uppercase text-[var(--red-light)]">
                                Line-up
                              </div>
                              <div className="mt-6 whitespace-pre-line break-words text-[clamp(2.25rem,7vw,5.5rem)] font-black leading-[0.92] tracking-[-0.045em] text-white [overflow-wrap:anywhere]">
                                {lineup}
                              </div>
                            </div>
                          ) : null}

                          {lineupVideo ? (
                            <div className="relative mx-auto w-full max-w-[390px]">
                              <div className="absolute -inset-5 bg-[var(--red-acc)]/20 blur-3xl" />
                              <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
                                <video
                                  ref={lineupVideoRef}
                                  src={lineupVideo}
                                  className="aspect-[9/16] w-full object-cover"
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  controls
                                  preload="metadata"
                                  onCanPlay={(event) => playMutedVideo(event.currentTarget)}
                                />
                              </div>
                              <div className="mt-4 text-center text-[9px] tracking-[0.32em] uppercase text-white/45">
                                Event reel
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </section>
                    ) : null}

                    {gallery.length ? (
                      <section>
                        <div className="mb-8 flex items-end justify-between gap-5 md:mb-12">
                          <div>
                            <div className="text-[10px] font-semibold tracking-[0.38em] uppercase text-[var(--red-light)]">
                              The night
                            </div>
                            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-white md:text-6xl">
                              Moments
                            </h2>
                          </div>
                          <div className="text-[10px] tracking-[0.24em] uppercase text-white/40">
                            {gallery.length} shots
                          </div>
                        </div>

                        <div className="columns-1 gap-3 sm:columns-2 md:columns-3 md:gap-4">
                          {gallery.map((url, i) => (
                            <button
                              key={`g-${i}`}
                              type="button"
                              onClick={() => openLightbox(i)}
                              className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left focus:outline-none focus:ring-2 focus:ring-[var(--red-acc)]/70 md:mb-4"
                              aria-label={`Apri immagine ${i + 1} di ${gallery.length}`}
                            >
                              <img
                                src={url}
                                alt={`Gallery ${i + 1}`}
                                className={`w-full object-cover transition duration-700 group-hover:scale-[1.035] group-hover:opacity-90 ${
                                  i % 5 === 0
                                    ? "aspect-[4/5]"
                                    : i % 3 === 0
                                      ? "aspect-square"
                                      : "aspect-[4/3]"
                                }`}
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-35 transition group-hover:opacity-80" />
                              <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-between p-4 text-[9px] tracking-[0.28em] uppercase text-white/80 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                                <span>
                                  Shot {String(i + 1).padStart(2, "0")}
                                </span>
                                <span>View ↗</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {showAtmos ? (
                      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(147,11,12,0.14),rgba(255,255,255,0.025))] p-6 md:p-10">
                        <div className="text-[10px] font-semibold tracking-[0.38em] uppercase text-[var(--red-light)]">
                          Atmosphere
                        </div>
                        <div className="mt-6 grid gap-7 md:grid-cols-3">
                          {sound.length ? (
                            <div>
                              <div className="text-[9px] tracking-[0.28em] uppercase text-white/40">
                                Sound
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {sound.map((t, i) => (
                                  <Pill key={`sound-${i}`} tone="sound">
                                    {t}
                                  </Pill>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {light.length ? (
                            <div>
                              <div className="text-[9px] tracking-[0.28em] uppercase text-white/40">
                                Light
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {light.map((t, i) => (
                                  <Pill key={`light-${i}`} tone="light">
                                    {t}
                                  </Pill>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {energy.length ? (
                            <div>
                              <div className="text-[9px] tracking-[0.28em] uppercase text-white/40">
                                Energy
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {energy.map((t, i) => (
                                  <Pill key={`energy-${i}`} tone="energy">
                                    {t}
                                  </Pill>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </section>
                    ) : null}

                    {invite ? (
                      <section className="relative overflow-hidden rounded-[28px] border border-[var(--red-acc)]/35 bg-[var(--red-acc)]/10 px-6 py-12 text-center md:px-14 md:py-16">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(147,11,12,0.6),transparent_58%)]" />
                        <div className="relative">
                          <div className="text-[10px] font-semibold tracking-[0.38em] uppercase text-[var(--red-light)]">
                            Until next time
                          </div>
                          <div className="mx-auto mt-6 max-w-3xl whitespace-pre-line break-words text-xl leading-8 text-white/85 md:text-3xl md:leading-10">
                            {invite}
                          </div>
                        </div>
                      </section>
                    ) : null}

                    <div className="flex justify-center pb-10">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-full border border-white/20 bg-white/5 px-7 py-3 text-[10px] font-semibold tracking-[0.24em] uppercase text-white transition hover:border-white/40 hover:bg-white/10"
                      >
                        ← Torna agli eventi
                      </button>
                    </div>
                  </div>
                </main>
              </>
            ) : null}
          </div>

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

                    <div
                      className="absolute inset-x-0 bottom-0"
                      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
                    >
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                      <div className="relative px-5 pb-1">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={prevImg}
                            disabled={gallery.length <= 1}
                            className={[
                              "w-11 h-11 rounded-full grid place-items-center",
                              "text-[24px] leading-none select-none",
                              "bg-black/45 text-white/90",
                              "border border-white/20 backdrop-blur-sm",
                              "shadow-[0_4px_18px_rgba(0,0,0,.35)]",
                              "hover:bg-black/60 hover:border-white/30 active:scale-[0.98] transition",
                              gallery.length <= 1 ? "opacity-30 cursor-not-allowed hover:bg-black/45 hover:border-white/20" : "",
                            ].join(" ")}
                            aria-label="Immagine precedente"
                            title="Prev"
                          >
                            ‹
                          </button>

                          <button
                            type="button"
                            onClick={closeLightbox}
                            className={[
                              "w-11 h-11 rounded-full grid place-items-center",
                              "text-[18px] leading-none select-none",
                              "bg-white/90 text-black",
                              "border border-white/40 backdrop-blur-sm",
                              "shadow-[0_4px_18px_rgba(0,0,0,.28)]",
                              "hover:bg-white active:scale-[0.98] transition",
                            ].join(" ")}
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
                              "w-11 h-11 rounded-full grid place-items-center",
                              "text-[24px] leading-none select-none",
                              "bg-black/45 text-white/90",
                              "border border-white/20 backdrop-blur-sm",
                              "shadow-[0_4px_18px_rgba(0,0,0,.35)]",
                              "hover:bg-black/60 hover:border-white/30 active:scale-[0.98] transition",
                              gallery.length <= 1 ? "opacity-30 cursor-not-allowed hover:bg-black/45 hover:border-white/20" : "",
                            ].join(" ")}
                            aria-label="Immagine successiva"
                            title="Next"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {autoplayBlocked && !lightboxOpen ? (
            <button
              type="button"
              onClick={startVisibleMedia}
              className="absolute inset-x-4 bottom-5 z-50 mx-auto w-fit rounded-full border border-white/25 bg-[var(--red-acc)] px-5 py-3 text-[10px] font-semibold tracking-[0.2em] uppercase text-white shadow-[0_12px_35px_rgba(0,0,0,0.6)] backdrop-blur-xl md:bottom-7"
            >
              ▶ Tocca per avviare i video
            </button>
          ) : null}

          <style jsx>{`
            .experience-scrollbar {
              scrollbar-color: #b51216 #0a0a0b;
              scrollbar-width: thin;
            }

            .experience-scrollbar::-webkit-scrollbar {
              width: 8px;
            }

            .experience-scrollbar::-webkit-scrollbar-track {
              background: #0a0a0b;
            }

            .experience-scrollbar::-webkit-scrollbar-thumb {
              border: 2px solid #0a0a0b;
              border-radius: 999px;
              background: linear-gradient(180deg, #ef3438 0%, #930b0c 58%, #650708 100%);
              box-shadow: 0 0 12px rgba(239, 52, 56, 0.42);
            }

            .experience-scrollbar::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, #ff5558 0%, #c31418 58%, #82090b 100%);
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
