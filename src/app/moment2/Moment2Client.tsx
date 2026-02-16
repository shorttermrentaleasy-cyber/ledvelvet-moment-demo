
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DeepDiveOverlay from "./DeepDiveOverlay";

type Level = "BASE" | "VIP" | "FOUNDER";

type Product = {
  sku: string;
  name: string;
  price: number;
  sizes: string[];
  stock: Record<string, number>;
  image: string;
};

type CartItem = {
  sku: string;
  name: string;
  qty: number;
  price: number;
  size?: string;
};

type SponsorRef = { id: string; label: string; logoUrl?: string; website?: string };

type EventItem = {
  id: string;
  name: string;
  city: string;
  date: string;
  phase: "upcoming" | "past";
  ticketUrl?: string;

  // Airtable "Notes"
  notes?: string;

  teaserUrl?: string;
  aftermovieUrl?: string;
  featured?: boolean;
  heroOnly?: boolean;

  heroTitle?: string;
  heroSubtitle?: string;
  deepdiveSlug?: string;
  deepdivePublished?: boolean;
  tag?: string;
  sponsors?: SponsorRef[];
  posterSrc: string;
  videoMp4?: string | null;
};

type SponsorForm = {
  brand: string;
  name: string;
  email: string;
  phone: string;
  budget: string;
  note: string;
  interestType: string;
};

type MetaOption = { id?: string; name: string; color?: string | null };

type HeroPublic = {
  title: string;
  subtitle: string;
  active: boolean;
  videoUrl?: string; // mp4 OR youtube link
  posterUrl?: string;
  imageUrl?: string;
};

const SOCIALS = {
  instagram: "https://www.instagram.com/led_velvet/",
  tiktok: "https://www.tiktok.com/@led_velvet",
  telegram: "https://t.me/+BXlRkPYgops1ZWJk",
};

function normalizeSponsors(v: any): SponsorRef[] {
  const looksLikeAirtableRecordId = (s: string) => /^rec[a-zA-Z0-9]{14}$/.test((s || "").trim());

  if (!v) return [];
  if (!Array.isArray(v)) return [];
  if (v.length === 0) return [];

  if (typeof v[0] === "object" && v[0]) {
    return v
      .map((x: any) => {
        const id = String(x.id || "").trim();

        const rawLabel = String(x.label || "").trim();
        const fallbackLabel = String(x.name || x.brand || x.company || x.title || "").trim();

        let label = rawLabel;
        if (!label || looksLikeAirtableRecordId(label)) label = fallbackLabel;

        if (!label || looksLikeAirtableRecordId(label)) return null;

        return {
          id: id || label,
          label,
          logoUrl: x.logoUrl ? String(x.logoUrl).trim() : undefined,
          website: x.website ? String(x.website).trim() : undefined,
        } as SponsorRef;
      })
      .filter((s: any): s is SponsorRef => !!s && !!s.id && !!s.label);
  }

  return [];
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function normalizePhone(raw: string) {
  const cleaned = raw.replace(/[^\d+\s]/g, "").trim();
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!cleaned) return "";
  if (digits.length < 6) return "";
  return cleaned;
}

const firstStr = (v: any) => (Array.isArray(v) ? String(v[0] ?? "").trim() : String(v ?? "").trim());

function fmtDateIT(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function getYearSafe(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getFullYear();
  const m = String(dateStr).match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function safeTimeMs(dateStr: string): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
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

function youTubeEmbedUrl(urlRaw: string, autoplayMuted = true): string | null {
  const id = getYouTubeId(urlRaw);
  if (!id) return null;

  const base = `https://www.youtube-nocookie.com/embed/${id}`;
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });

  if (autoplayMuted) {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }

  return `${base}?${params.toString()}`;
}

function looksLikeMp4(url: string): boolean {
  const s = (url || "").trim().toLowerCase();
  return !!s && (s.includes(".mp4") || s.endsWith(".mp4"));
}

// ---- Social icons (NO lucide-react) ----
function SocialIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/15 text-white/70 hover:text-[var(--red-accent)] hover:border-white/30 hover:bg-white/10 transition"
    >
      <span className="w-4 h-4 block">{children}</span>
    </a>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M7.5 2.8h9A4.7 4.7 0 0 1 21.2 7.5v9a4.7 4.7 0 0 1-4.7 4.7h-9a4.7 4.7 0 0 1-4.7-4.7v-9A4.7 4.7 0 0 1 7.5 2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 16.3a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M17.2 6.9h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function IconTikTok() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M14 3v11.2a3.8 3.8 0 1 1-3.3-3.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 6.2c1.1 1.7 2.6 2.7 4.5 2.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M21.5 4.6 3.2 11.5c-.9.3-.9 1.6.1 1.9l4.7 1.5 1.8 5.4c.3.9 1.5 1 2 .2l2.9-4 4.7 3.4c.7.5 1.7.1 1.9-.8l2.5-14.6c.2-1-.8-1.8-1.8-1.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8 14.9 19.7 7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Marquee({ text }: { text: string }) {
  return (
    <div className="border-t border-[var(--red-accent)] bg-[var(--red-accent)] text-black overflow-hidden whitespace-nowrap">
      <div className="py-3">
        <div
          className="inline-block pl-[100%] font-semibold tracking-[0.18em] uppercase"
          style={{ animation: "lv_marquee 18s linear infinite" as any }}
        >
          {text}
        </div>
      </div>
      <style>{`
        @keyframes lv_marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
const SHOW_TOP_BAR = false; // <-- cambia a true quando vuoi rivederla
export default function Moment2() {
const HERO_MODE = "mp4" as const;
  const palette = {
    bg: "#050505",
    surface: "#080808",
    surface2: "#0c0c0c",
    text: "#F5F5F5",
    muted: "rgba(245,245,245,0.70)",
    border: "rgba(255,255,255,0.08)",
    redDark: "#7d0d0e",
    redAccent: "#930b0c",
  } as const;

  const brand = {
    logo: "/logo.png",
    heroPoster: "/og.png",
    heroVideoMp4: "/hero.mp4",
    heroVideoWebm: "",
  };

  const router = useRouter();
  const sp = useSearchParams();

  const experienceSlug = sp.get("experience");
  const ticketUrlQ = sp.get("ticketUrl") || "";
  const cityQ = sp.get("city") || "";
  const dateLabelQ = sp.get("dateLabel") || "";

  const [heroPublic, setHeroPublic] = useState<HeroPublic>({
    title: "",
    subtitle: "",
    active: true,
    videoUrl: "",
    posterUrl: "",
    imageUrl: "",
  });

  const [deepDiveOpen, setDeepDiveOpen] = useState<{
    slug?: string;
    ticketUrl?: string;
    city?: string;
    dateLabel?: string;
  } | null>(null);

  useEffect(() => {
    if (experienceSlug) setDeepDiveOpen((prev) => ({ ...(prev || {}), slug: experienceSlug }));
    else setDeepDiveOpen(null);
  }, [experienceSlug]);

  const [user, setUser] = useState<{ email: string | null; level?: Level; kyc?: boolean }>({ email: null });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [showCart, setShowCart] = useState(false);
  const [cartTimerMin, setCartTimerMin] = useState(10);

  const [interestOptions, setInterestOptions] = useState<MetaOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);

  const [sponsor, setSponsor] = useState<SponsorForm>({
    brand: "",
    name: "",
    email: "",
    phone: "",
    budget: "",
    note: "",
    interestType: "",
  });
  const [sponsorSending, setSponsorSending] = useState(false);
  const [sponsorSentOk, setSponsorSentOk] = useState<string | null>(null);
  const [sponsorSentErr, setSponsorSentErr] = useState<string | null>(null);

  const [muted, setMuted] = useState(true);
  const [fsErr, setFsErr] = useState<string | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  // --- Ambient music player (Airtable MP3 via /api/public/playlist) ---
  type AmbientTrack = {
    id: string;
    title: string;
    artist?: string;
    audio_url: string;
    cover_url?: string;
    sort?: number;
  };

  const [musicMinimized, setMusicMinimized] = useState(true);
  const [ambientTracks, setAmbientTracks] = useState<AmbientTrack[]>([]);
  const [ambientIdx, setAmbientIdx] = useState(0);
  const [ambientPlaying, setAmbientPlaying] = useState(false);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const ambientCurrent = ambientTracks[ambientIdx] || null;
  const [ambientDur, setAmbientDur] = useState(0);
  const [ambientT, setAmbientT] = useState(0);
  const ambientShouldAutoplayRef = useRef(false);

  function fmtTime(sec: number) {
    if (!sec || !isFinite(sec)) return "0:00";
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function ambientSeek(next: number) {
    const a = ambientAudioRef.current;
    if (!a || !isFinite(next)) return;
    a.currentTime = Math.max(0, Math.min(next, a.duration || next));
    setAmbientT(a.currentTime || 0);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/public/playlist", { cache: "no-store" });
        const ct = r.headers.get("content-type") || "";
        if (!ct.toLowerCase().includes("application/json")) throw new Error("playlist_non_json");

        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error || "playlist_failed");
        const list: AmbientTrack[] = Array.isArray(j?.tracks) ? j.tracks : [];

        if (!cancelled) {
          setAmbientTracks(list);
          setAmbientIdx(0);
        }
      } catch {
        if (!cancelled) setAmbientTracks([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const a = ambientAudioRef.current;
    if (!a) return;

    if (ambientCurrent?.audio_url) {
      a.src = ambientCurrent.audio_url;
      try {
        a.load();
      } catch {}

      if (ambientShouldAutoplayRef.current) {
        a.play()
          .then(() => setAmbientPlaying(true))
          .catch(() => setAmbientPlaying(false));
      } else {
        setAmbientPlaying(false);
      }
    }
  }, [ambientCurrent?.audio_url]);

  function ambientPlay() {
    const a = ambientAudioRef.current;
    if (!a || !ambientCurrent?.audio_url) return;

    ambientShouldAutoplayRef.current = true;

    a.play()
      .then(() => setAmbientPlaying(true))
      .catch(() => {
        setAmbientPlaying(false);
      });
  }

  function ambientPause() {
    const a = ambientAudioRef.current;
    if (!a) return;

    ambientShouldAutoplayRef.current = false;
    a.pause();
    setAmbientPlaying(false);
  }

  function ambientToggle() {
    if (ambientPlaying) ambientPause();
    else ambientPlay();
  }

  function ambientNext() {
    if (!ambientTracks.length) return;
    const next = ambientIdx + 1 < ambientTracks.length ? ambientIdx + 1 : 0;
    setAmbientIdx(next);
  }

  function ambientPrev() {
    if (!ambientTracks.length) return;
    const prev = ambientIdx - 1 >= 0 ? ambientIdx - 1 : ambientTracks.length - 1;
    setAmbientIdx(prev);
  }

  const [eventsReloadTick, setEventsReloadTick] = useState(0);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsErr, setEventsErr] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});


  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lv_events_updated_at" || e.key === "lv_deepdive_updated_at") {
        try {
          sessionStorage.removeItem("lv_public_events_v2");
        } catch {}
        setEventsReloadTick((t) => t + 1);
      }
    };

    const onFocus = () => {
      try {
        sessionStorage.removeItem("lv_public_events_v2");
      } catch {}
      setEventsReloadTick((t) => t + 1);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ✅ HERO robust: j.hero OR j.booklet.hero OR j.data.hero
  function extractHero(j: any): any | null {
    if (j?.hero) return j.hero;
    if (j?.booklet?.hero) return j.booklet.hero;
    if (j?.data?.hero) return j.data.hero;
    return null;
  }

  useEffect(() => {
    let alive = true;

    async function loadHero() {
      try {
        const r = await fetch("/api/public/hero", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        if (!r.ok || !j?.ok) return;

        const h = extractHero(j);
        if (!h) return;

        setHeroPublic({
          title: String(h.title || ""),
          subtitle: String(h.subtitle || "Ethereal clubbing in unconventional places"),
          active: Boolean(h.active),
          videoUrl: String(h.videoUrl || h.video_url || ""),
          posterUrl: String(h.posterUrl || h.poster_url || ""),
          imageUrl: String(h.imageUrl || h.image_url || ""),
        });
      } catch {}
    }

    loadHero();
    return () => {
      alive = false;
    };
  }, [eventsReloadTick]);

  useEffect(() => {
    let alive = true;

    async function loadEvents() {
      setEventsLoading(true);
      setEventsErr(null);

      // ✅ session cache (avoid reload after back)
      try {
        const cached = sessionStorage.getItem("lv_public_events_v2");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length) {
            setEvents(parsed);
            setEventsLoading(false);
          }
        }
      } catch {}

      try {
        const r = await fetch("/api/public/events?limit=100", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        if (!r.ok || !j?.ok) {
          const extra = j?.extra ? ` — ${JSON.stringify(j.extra)}` : "";
          throw new Error((j?.error || "Errore caricamento eventi") + extra);
        }

        const raw: any[] = Array.isArray(j?.events) ? j.events : Array.isArray(j?.items) ? j.items : [];

        const norm: EventItem[] = raw
          .map((e) => {
            const phaseRaw = (e.phase || "").toString().toLowerCase();
            const phase: "past" | "upcoming" = phaseRaw === "past" ? "past" : "upcoming";

            return {
              id: e.id || e.airtableId || e.eventId || crypto.randomUUID(),
              name: e.name || e["Event Name"] || "",
              city: e.city || e["City"] || "",
              date: e.date || e["date"] || "",
              phase,
              ticketUrl: e.ticketUrl || e["Ticket Url"] || "",
              notes: (e.notes || e["Notes"] || "").toString(),
              teaserUrl: e.teaserUrl || e["Teaser"] || "",
              aftermovieUrl: e.aftermovieUrl || e["Aftermovie"] || "",
              featured: Boolean(e.featured),
              heroOnly: Boolean((e.heroOnly ?? e.HeroOnly ?? e["HeroOnly"]) as any),
              heroTitle: e.heroTitle || e["Hero Title"] || "",
              heroSubtitle: e["Hero Subtitle"] || e.heroSubtitle || "",
              deepdiveSlug: firstStr(e.deepdive_slug) || firstStr(e.DeepDiveSlug) || firstStr(e.DEEP_DIVE_SLUG),
              deepdivePublished: Boolean(e.deepdivePublished),
              tag: (e.status || e.tag || "").toString(),
              sponsors: normalizeSponsors(e.sponsors),
              posterSrc: e.posterSrc || e["Hero Image"] || "/og.png",
              videoMp4: null,
            };
          })
          .filter((x) => x.name)
          // keep global sort desc (past)
          .sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));

        setEvents(norm);

        try {
          sessionStorage.setItem("lv_public_events_v2", JSON.stringify(norm));
        } catch {}
      } catch (e: any) {
        if (!alive) return;
        setEventsErr(e?.message || "Errore caricamento eventi");
        setEvents([]);
      } finally {
        if (!alive) return;
        setEventsLoading(false);
      }
    }

    loadEvents();
    return () => {
      alive = false;
    };
  }, [eventsReloadTick]);

  useEffect(() => {
    let alive = true;

    async function loadMeta() {
      setMetaLoading(true);
      try {
        const r = await fetch("/api/meta/sponsor-request-options", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        if (r.ok && j?.ok) {
          setInterestOptions(Array.isArray(j?.interestTypeOptions) ? j.interestTypeOptions : []);
        } else {
          setInterestOptions([]);
        }
      } catch {
        if (!alive) return;
        setInterestOptions([]);
      } finally {
        if (!alive) return;
        setMetaLoading(false);
      }
    }

    loadMeta();
    return () => {
      alive = false;
    };
  }, []);

  async function toggleMute() {
    setFsErr(null);
    try {
      const v = heroVideoRef.current;
      if (!v) return;

      const nextMuted = !muted;
      v.muted = nextMuted;
      v.volume = nextMuted ? 0 : 1;
      setMuted(nextMuted);

      await v.play();
    } catch {
      setFsErr("Su mobile l'audio può essere bloccato: prova a toccare il video e poi riprova.");
    }
  }

  function requestHeroFullscreen() {
    setFsErr(null);
    const el = heroVideoRef.current as any;
    if (!el) return;

    try {
      if (typeof el.webkitEnterFullscreen === "function") {
        el.webkitEnterFullscreen();
        return;
      }
    } catch {}

    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen || null;

    try {
      fn?.call(el);
    } catch {
      setFsErr("Fullscreen non supportato su questo dispositivo/browser.");
    }
  }

  const products: Product[] = [
    { sku: "LV-TEE-BLK", name: "LedVelvet Tee – Black", price: 34, sizes: ["S", "M", "L", "XL"], stock: { S: 12, M: 20, L: 14, XL: 8 }, image: "/shop/tee.png" },
    { sku: "LV-HAT", name: "LedVelvet Cap", price: 29, sizes: ["UNI"], stock: { UNI: 30 }, image: "/shop/cap.png" },
    { sku: "LV-SCARF", name: "LedVelvet Scarf", price: 49, sizes: ["UNI"], stock: { UNI: 15 }, image: "/shop/scarf.png" },
  ];

  function addToCart(p: Product) {
    const chosen = selectedSize[p.sku] || p.sizes[0] || "UNI";
    const stock = p.stock[chosen] ?? 0;

    setCart((c) => {
      const i = c.findIndex((x) => x.sku === p.sku && x.size === chosen);
      const currentQty = i >= 0 ? c[i].qty : 0;
      if (currentQty >= stock) {
        alert("Stock esaurito per questa taglia");
        return c;
      }
      if (i >= 0) {
        const copy = [...c];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...c, { sku: p.sku, name: p.name, price: p.price, qty: 1, size: chosen }];
    });
  }

  async function submitSponsorRequest() {
    setSponsorSentOk(null);
    setSponsorSentErr(null);

    const brandVal = sponsor.brand.trim();
    const nameVal = sponsor.name.trim();
    const emailVal = sponsor.email.trim();
    const phoneVal = sponsor.phone.trim();

    if (!brandVal) return setSponsorSentErr("Inserisci Brand/Azienda.");
    if (!nameVal) return setSponsorSentErr("Inserisci il referente.");
    if (!emailVal) return setSponsorSentErr("Inserisci l’email.");
    if (!isValidEmail(emailVal)) return setSponsorSentErr("Email non valida.");

    const phoneNorm = phoneVal ? normalizePhone(phoneVal) : "";
    if (phoneVal && !phoneNorm) return setSponsorSentErr("Telefono non valido (usa numeri e +).");

    if (interestOptions.length > 0 && sponsor.interestType) {
      const ok = interestOptions.some((o) => o.name === sponsor.interestType);
      if (!ok) return setSponsorSentErr("Interest type non valido.");
    }

    setSponsorSending(true);
    try {
      const payload = {
        ...sponsor,
        brand: brandVal,
        name: nameVal,
        email: emailVal,
        phone: phoneNorm || "",
        source: "website",
      };

      const res = await fetch("/api/sponsor-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        const msg = data?.error || data?.details?.error?.message || "Errore invio richiesta. Riprova.";
        throw new Error(msg);
      }

      setSponsorSentOk("Richiesta inviata! Ti risponderemo via email a breve.");
      setSponsor({ brand: "", name: "", email: "", phone: "", budget: "", note: "", interestType: "" });
    } catch (err: any) {
      setSponsorSentErr(err?.message || "Errore invio richiesta.");
    } finally {
      setSponsorSending(false);
    }
  }

  // ✅ UPCOMING sorted by nearest date first (asc)
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => e.phase === "upcoming" && !e.heroOnly)
      .slice()
      .sort((a, b) => safeTimeMs(a.date) - safeTimeMs(b.date));
  }, [events]);

  const pastEvents = events.filter((e) => e.phase === "past" && !e.heroOnly);

  const pastByYear = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    for (const e of pastEvents) {
      const y = getYearSafe(e.date);
      const key = y ? String(y) : "Other";
      (map[key] ||= []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k] = [...map[k]].sort((a, b) => safeTimeMs(b.date) - safeTimeMs(a.date));
    }
    return map;
  }, [pastEvents]);

  const pastYears = useMemo(() => {
    const keys = Object.keys(pastByYear);
    const years = keys
      .filter((k) => k !== "Other" && /^\d{4}$/.test(k))
      .map((k) => Number(k))
      .sort((a, b) => b - a)
      .map(String);
    if (keys.includes("Other")) years.push("Other");
    return years;
  }, [pastByYear]);

  const tier = user.level || (user.email ? "BASE" : undefined);
  const tierLabel = tier ? `SOCIO ${tier}` : "VISITATORE";

  const heroTitle = heroPublic.active ? heroPublic.title.trim() : "";
  const heroSubtitle = heroPublic.active ? heroPublic.subtitle.trim() : "";

  const heroPosterResolved = (heroPublic.posterUrl || heroPublic.imageUrl || brand.heroPoster || "").trim();
  const heroImageResolved = (heroPublic.imageUrl || brand.heroPoster || "").trim();

  const heroMp4Resolved = (heroPublic.videoUrl || "").trim();

  
  console.log("HERO videoUrl from API:", heroPublic.videoUrl);
  console.log("HERO resolved mp4:", heroMp4Resolved);

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--text)] selection:bg-[var(--red-accent)] selection:text-black"
      style={{
        ["--bg" as any]: palette.bg,
        ["--surface" as any]: palette.surface,
        ["--surface2" as any]: palette.surface2,
        ["--text" as any]: palette.text,
        ["--muted" as any]: palette.muted,
        ["--border" as any]: palette.border,
        ["--red-dark" as any]: palette.redDark,
        ["--red-accent" as any]: palette.redAccent,
      }}
    >
    
     {/* Sticky header */}
<div className="sticky top-0 z-[9999] relative isolate border-b border-white/10 bg-[var(--surface)]">

  {SHOW_TOP_BAR && (
    <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between text-xs tracking-wide">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <span className="uppercase">Cart reserved for</span>
        <span className="font-medium">·</span>
        <button
          className="underline underline-offset-4 hover:text-[var(--text)]"
          onClick={() => setCartTimerMin((m) => (m >= 30 ? 10 : m + 5))}
          type="button"
        >
          Add time
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="uppercase text-[var(--muted)]">{tierLabel}</span>
        <button
          className="px-3 py-1 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10"
          onClick={() => setShowCart(true)}
          type="button"
        >
          Cart
        </button>
      </div>
    </div>
  )}


<div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 min-w-0 overflow-x-hidden">
  {/* LEFT */}
  <div className="flex items-center gap-3 min-w-0">
    <img
      src={brand.logo}
      alt="LedVelvet"
      className="w-10 h-10 rounded-full border border-white/10 shrink-0"
    />
    <div className="leading-tight min-w-0">
      <div className="text-sm font-semibold truncate">LedVelvet</div>
      <div className="text-xs text-white/60 tracking-[0.18em] uppercase truncate">
        ETHERAL CLUBBING
      </div>
    </div>
  </div>

  {/* DESKTOP MENU (lg+) */}
  <nav className="hidden lg:flex items-center gap-8 text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
    <a href="#home" className="hover:text-[var(--text)] whitespace-nowrap">Home</a>
    <a href="#eventi" className="hover:text-[var(--text)] whitespace-nowrap">Upcoming</a>
    <a href="#past" className="hover:text-[var(--text)] whitespace-nowrap">Past</a>
    <a href="#sponsor" className="hover:text-[var(--text)] whitespace-nowrap">Sponsor</a>
    <a href="/about" className="hover:text-[var(--text)] whitespace-nowrap">About</a>
  </nav>

  {/* RIGHT SIDE */}
  <div className="flex items-center gap-2 flex-none">

    {/* DESKTOP SOCIAL (lg+) */}
    <div className="hidden lg:flex items-center gap-2">
      <SocialIcon href={SOCIALS.instagram} label="Instagram">
        <IconInstagram />
      </SocialIcon>
      <SocialIcon href={SOCIALS.tiktok} label="TikTok">
        <IconTikTok />
      </SocialIcon>
      <SocialIcon href={SOCIALS.telegram} label="Telegram">
        <IconTelegram />
      </SocialIcon>
    </div>

    {/* TABLET MENU BUTTON (md → < lg) */}
    <details className="hidden md:block lg:hidden">
      <summary
        className="list-none cursor-pointer px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase whitespace-nowrap flex items-center gap-2"
      >
        Menu ≡
      </summary>
<div className="fixed right-4 top-[72px] w-[min(92vw,420px)] rounded-2xl border border-white/12 bg-black/70 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.55)] p-3 z-[10000]">

       <div className="grid gap-1 text-xs tracking-[0.22em] uppercase">
          <a href="#home" className="px-3 py-3 rounded-xl hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]">Home</a>
          <a href="#eventi" className="px-3 py-3 rounded-xl hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]">Upcoming</a>
          <a href="#past" className="px-3 py-3 rounded-xl hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]">Past</a>
          <a href="#sponsor" className="px-3 py-3 rounded-xl hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]">Sponsor</a>
          <a href="/about" className="px-3 py-3 rounded-xl hover:bg-white/10 text-[var(--muted)] hover:text-[var(--text)]">About</a>
        </div>

        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
          <SocialIcon href={SOCIALS.instagram} label="Instagram">
            <IconInstagram />
          </SocialIcon>
          <SocialIcon href={SOCIALS.tiktok} label="TikTok">
            <IconTikTok />
          </SocialIcon>
          <SocialIcon href={SOCIALS.telegram} label="Telegram">
            <IconTelegram />
          </SocialIcon>
        </div>
      </div>
    </details>

    {/* AUTH */}
    {!user.email ? (
      <a
        href="/login"
        className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase whitespace-nowrap"
      >
        Accedi
      </a>
    ) : (
      <div className="flex items-center gap-2">
        <select
          className="bg-transparent rounded-full px-3 py-2 text-xs tracking-[0.18em] uppercase border border-white/15 text-[var(--text)] max-w-[140px]"
          value={user.level || "BASE"}
          onChange={(e) => setUser((u) => ({ ...u, level: e.target.value as Level }))}
        >
          <option value="BASE">BASE</option>
          <option value="VIP">VIP</option>
          <option value="FOUNDER">FOUNDER</option>
        </select>

        <button
          onClick={() => setUser({ email: null })}
          className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase whitespace-nowrap"
          type="button"
        >
          Esci
        </button>
      </div>
    )}
  </div>
</div>

{/* MOBILE BAR (< md only) */}
<div className="md:hidden border-t border-white/10 overflow-x-hidden">
  <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
    <div className="flex gap-5 overflow-x-auto text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
      <a href="#home" className="shrink-0 hover:text-[var(--text)]">Home</a>
      <a href="#eventi" className="shrink-0 hover:text-[var(--text)]">Upcoming</a>
      <a href="#past" className="shrink-0 hover:text-[var(--text)]">Past</a>
      <a href="#sponsor" className="shrink-0 hover:text-[var(--text)]">Sponsor</a>
      <a href="/about" className="shrink-0 hover:text-[var(--text)]">About</a>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      <SocialIcon href={SOCIALS.instagram} label="Instagram">
        <IconInstagram />
      </SocialIcon>
      <SocialIcon href={SOCIALS.tiktok} label="TikTok">
        <IconTikTok />
      </SocialIcon>
      <SocialIcon href={SOCIALS.telegram} label="Telegram">
        <IconTelegram />
      </SocialIcon>
    </div>
  </div>
</div>


</div>

      {/* Ambient music player */}
      {ambientTracks.length > 0 ? (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] w-[calc(100vw-16px)] sm:w-[520px]">
          <style>{`
            .lv-audio::-webkit-media-controls-panel { background-color: rgba(0,0,0,0.55); }
            .lv-audio::-webkit-media-controls-enclosure { border-radius: 14px; background-color: rgba(0,0,0,0.55); }
            .lv-audio::-webkit-media-controls-timeline,
            .lv-audio::-webkit-media-controls-volume-slider { filter: brightness(1.8) contrast(1.4); }
            .lv-audio::-webkit-media-controls-play-button,
            .lv-audio::-webkit-media-controls-mute-button,
            .lv-audio::-webkit-media-controls-current-time-display,
            .lv-audio::-webkit-media-controls-time-remaining-display { filter: brightness(1.25); }
          `}</style>

          <div className="border border-white/15 bg-black/75 backdrop-blur-md rounded-2xl overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
            <div className="px-3 py-2 flex items-center gap-3 border-b border-white/10">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] tracking-[0.32em] uppercase text-white/70">Ambient Music</div>
                <div className="mt-1 text-[12px] text-white/90 truncate">
                  {ambientCurrent?.title || "—"}
                  {ambientCurrent?.artist ? <span className="text-white/55"> · {ambientCurrent.artist}</span> : null}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={ambientPrev}
                  className="h-9 w-9 rounded-full border border-white/20 hover:bg-white/10 text-white/85"
                  aria-label="Prev"
                  type="button"
                >
                  ◀
                </button>

                <button
                  onClick={ambientToggle}
                  className="h-10 w-10 rounded-full border border-white/25 bg-white/10 text-white"
                  aria-label="Play Pause"
                  type="button"
                >
                  {ambientPlaying ? "❚❚" : "▶"}
                </button>

                <button
                  onClick={ambientNext}
                  className="h-9 w-9 rounded-full border border-white/20 hover:bg-white/10 text-white/85"
                  aria-label="Next"
                  type="button"
                >
                  ▶
                </button>

                <button
                  onClick={() => setMusicMinimized((v) => !v)}
                  className="h-9 w-9 rounded-full border border-white/20 hover:bg-white/10 text-white/70"
                  aria-label="Open"
                  type="button"
                >
                  ⌄
                </button>

                <button
                  onClick={() => {
                    setMusicMinimized(true);
                    ambientPause();
                  }}
                  className="h-9 w-9 rounded-full border border-white/20 hover:bg-white/10 text-white/60"
                  aria-label="Close"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              className="overflow-hidden"
              style={{
                maxHeight: musicMinimized ? 0 : 140,
                opacity: musicMinimized ? 0 : 1,
                transition: "max-height 220ms ease, opacity 160ms ease",
                pointerEvents: musicMinimized ? "none" : "auto",
              }}
            >
              <div className="px-3 py-2 bg-[rgba(147,11,12,0.35)] border-t border-white/15">
                <audio
                  ref={ambientAudioRef}
                  src={ambientCurrent?.audio_url || ""}
                  preload="metadata"
                  crossOrigin="anonymous"
                  onEnded={() => {
                    ambientShouldAutoplayRef.current = true;
                    ambientNext();
                  }}
                  onLoadedMetadata={(e) => {
                    const a = e.currentTarget;
                    setAmbientDur(a.duration || 0);
                    setAmbientT(a.currentTime || 0);
                  }}
                  onTimeUpdate={(e) => {
                    const a = e.currentTarget;
                    setAmbientT(a.currentTime || 0);
                  }}
                  style={{ display: "none" }}
                />

                <div className="flex gap-3 items-start">
                  <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/15 bg-black/40">
                    {ambientCurrent?.cover_url ? (
                      <img
                        src={ambientCurrent.cover_url}
                        alt={ambientCurrent.title || "cover"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-white/90 truncate">
                      {ambientCurrent?.title || "—"}
                      {ambientCurrent?.artist ? <span className="text-white/55"> · {ambientCurrent.artist}</span> : null}
                    </div>

                    <div className="mt-2">
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, Math.floor(ambientDur || 0))}
                        value={Math.floor(ambientT || 0)}
                        onChange={(e) => ambientSeek(Number(e.target.value))}
                        className="w-full lv-range"
                      />

                      <div className="mt-1 flex items-center justify-between text-[11px] text-white/60 tabular-nums">
                        <span>{fmtTime(ambientT)}</span>
                        <span>{fmtTime(ambientDur)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <style>{`
                  .lv-range {
                    -webkit-appearance: none;
                    appearance: none;
                    height: 10px;
                    background: rgba(255,255,255,0.10);
                    border-radius: 999px;
                    outline: none;
                    border: 1px solid rgba(255,255,255,0.14);
                  }
                  .lv-range::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.95);
                    border: 2px solid rgba(147,11,12,0.95);
                    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
                    cursor: pointer;
                  }
                  .lv-range::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.95);
                    border: 2px solid rgba(147,11,12,0.95);
                    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
                    cursor: pointer;
                  }
                `}</style>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* HERO — ✅ RIPULITO: UN SOLO BLOCCO */}
      <section id="home" className="relative h-[100svh] w-full bg-black">
        <div className="absolute inset-0">
          {heroMp4Resolved ? (
  		<video
   	 	key={heroMp4Resolved}   // 👈 QUESTA RIGA È LA CHIAVE
    	ref={heroVideoRef}
    	className="absolute inset-0 z-20 h-full w-full object-cover"
    	poster={heroPosterResolved || brand.heroPoster}
    	autoPlay
    	loop
    	muted={muted}
    	playsInline
    	preload="metadata"
  	>
    	<source src={heroMp4Resolved} type="video/mp4" />
  </video>
) : (

            <img
              src={heroImageResolved || brand.heroPoster}
              alt="LedVelvet"
              className="absolute inset-0 z-20 h-full w-full object-cover"
              loading="eager"
            />
          )}

          {/* base poster sempre sotto */}
          <img
            src={heroPosterResolved || brand.heroPoster}
            alt="LedVelvet"
            className="absolute inset-0 z-0 h-full w-full object-cover"
            loading="eager"
          />

          <div className="pointer-events-none absolute inset-0 z-40 bg-gradient-to-t from-black/95 via-black/55 to-black/10" />
          <div
            className="pointer-events-none absolute inset-0 z-40 opacity-60"
            style={{ background: "radial-gradient(900px circle at 50% 55%, rgba(147,11,12,0.22), transparent 62%)" }}
          />
        </div>

        <div className="absolute inset-0 z-50 flex items-center justify-center text-center px-6">
          <div className="w-full max-w-none">
            <img
              src={brand.logo}
              alt="LedVelvet"
              className="mx-auto w-36 h-36 sm:w-40 sm:h-40 md:w-48 md:h-48 lg:w-56 lg:h-56 object-contain opacity-70 drop-shadow-[0_10px_30px_rgba(0,0,0,0.65)]"
            />

            {heroTitle ? (
              <h1
                className="mt-3 mx-auto text-center font-semibold tracking-tight md:whitespace-nowrap"
                style={{ maxWidth: "75vw", fontSize: "clamp(2rem, 5.5vw, 4.5rem)", lineHeight: 1.05 }}
              >
                {heroTitle}
              </h1>
            ) : null}

            {heroSubtitle ? <p className="mt-4 text-white/75 text-base md:text-lg">{heroSubtitle}</p> : null}

            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <a href="#eventi" className="px-7 py-3 bg-[var(--red-accent)] text-black text-xs tracking-[0.18em] uppercase hover:opacity-90">
                Upcoming
              </a>
              <a href="#past" className="px-7 py-3 border border-white/25 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/10">
                Past recap
              </a>
            </div>
          </div>
        </div>

        {fsErr ? <div className="absolute left-3 right-3 bottom-3 z-50 bg-black/60 px-3 py-2 text-xs text-white/80">{fsErr}</div> : null}
{/* HERO controls */}
<div className="absolute right-4 bottom-4 z-[60] flex items-center gap-2">
  <button
    type="button"
    onClick={toggleMute}
    className="px-3 py-2 rounded-full border border-white/20 bg-black/40 text-white text-xs tracking-[0.18em] uppercase hover:bg-black/55"
  >
    {muted ? "Unmute" : "Mute"}
  </button>

  <button
    type="button"
    onClick={requestHeroFullscreen}
    className="px-3 py-2 rounded-full border border-white/20 bg-black/40 text-white text-xs tracking-[0.18em] uppercase hover:bg-black/55"
  >
    Fullscreen
  </button>
</div>

      </section>

      <Marquee text="Next Event · LedVelvet · Immersive Experience · Music · Atmosphere ·" />

      {/* UPCOMING */}
      <section id="eventi" className="py-16 bg-[var(--red-dark)]">
        <div className="w-full px-[6%]">
          <div className="text-[11px] tracking-[0.26em] uppercase text-white/80">Next</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2 text-white">Upcoming</h2>

          {eventsLoading && <div className="mt-6 text-sm text-white/80">Carico eventi...</div>}
          {eventsErr && <div className="mt-6 text-sm text-red-100">Errore: {eventsErr}</div>}

          <div className="grid lg:grid-cols-2 gap-6 mt-8">
            {upcomingEvents.map((e) => {
              const tag = (e.tag || "LISTE & TICKETS").toUpperCase();
              const soldOut = tag.includes("SOLD");
              return (
                <article key={e.id} className="bg-black/25 overflow-hidden border border-white/10">
                  <div className="relative aspect-[16/9] bg-black">
                    {(() => {
                      const yt = youTubeEmbedUrl(e.teaserUrl || "");
                      if (yt) {
                        return (
                          <iframe
                            className="absolute inset-0 z-20 h-full w-full"
                            src={yt}
                            title={`LedVelvet – ${e.name}`}
                            loading="lazy"
                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                          />
                        );
                      }
                      return <img src={e.posterSrc} alt={e.name} className="absolute inset-0 z-10 h-full w-full object-cover" loading="lazy" />;
                    })()}
                    <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs tracking-[0.22em] uppercase text-white/75">{tag}</div>

                      <div className="flex items-center gap-2">
                        {e.deepdiveSlug && e.deepdivePublished ? (
                          <button
                            onClick={() => {
                              const params = new URLSearchParams(sp.toString());
                              params.set("experience", e.deepdiveSlug!);
                              params.set("ticketUrl", e.ticketUrl || "");
                              params.set("city", e.city || "");
                              params.set("dateLabel", fmtDateIT(e.date));
                              router.replace(`/moment2?${params.toString()}`, { scroll: false });
                            }}
                            className="px-4 py-2 bg-white/10 border border-white/25 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/15 hover:border-white/40"
                          >
                            Enter the experience
                          </button>
                        ) : null}

                        {soldOut ? (
                          <span className="text-xs text-white/60">Sold out</span>
                        ) : e.ticketUrl ? (
                          <a
                            href={e.ticketUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 bg-[var(--red-accent)] text-black text-xs tracking-[0.18em] uppercase hover:opacity-90"
                          >
                            Book
                          </a>
                        ) : (
                          <span className="text-xs text-white/60">Ticket soon</span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-3 text-white">{e.name}</h3>
                    <div className="mt-2 text-sm text-white/80">
                      {e.city} • {fmtDateIT(e.date)}
                    </div>

            {e.notes ? (
  <div className="mt-3">
    <div className="relative">
      <div
        className="text-sm text-white/75 leading-relaxed"
        style={
          expandedNotes[e.id]
            ? {}
            : {
                display: "-webkit-box",
                WebkitLineClamp: 3 as any,
                WebkitBoxOrient: "vertical" as any,
                overflow: "hidden",
              }
        }
      >
        {e.notes}
      </div>

      {/* fade “instagram” SOLO quando è chiuso e SOLO su mobile */}
      {!expandedNotes[e.id] ? (
        <div className="md:hidden pointer-events-none absolute left-0 right-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
      ) : null}
    </div>

    {e.notes.length > 160 ? (
      <button
        type="button"
        onClick={() => setExpandedNotes((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
        className="mt-2 text-xs uppercase tracking-[0.18em] text-white/60 hover:text-white"
      >
        {expandedNotes[e.id] ? "Mostra meno" : "Continua a leggere"}
      </button>
    ) : null}
  </div>
) : null}

            
            
            
                    {e.sponsors && e.sponsors.length > 0 ? (
                      <div className="mt-4">
                        <div className="text-[10px] tracking-[0.26em] uppercase text-white/75">Sponsors</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {e.sponsors.map((s) => {
                            const Wrapper: any = s.website ? "a" : "span";
                            const wrapperProps = s.website ? { href: s.website, target: "_blank", rel: "noreferrer" } : {};
                            return (
                              <Wrapper
                                key={s.id}
                                {...wrapperProps}
                                className={cn(
                                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/25 bg-black/35 text-[11px] text-white/90",
                                  s.website && "hover:bg-white/10 hover:border-white/40"
                                )}
                                title={s.website || s.id}
                              >
                                {s.logoUrl ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 border border-white/15 overflow-hidden">
                                    <img src={s.logoUrl} alt={s.label} className="w-full h-full object-cover" loading="lazy" />
                                  </span>
                                ) : (
                                  <span className="w-5 h-5 rounded-full bg-white/10 border border-white/15" />
                                )}
                                <span className="leading-none">{s.label}</span>
                              </Wrapper>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <Marquee text="Past Events · Aftermovies · LedVelvet ·" />

      {/* PAST */}
      <section id="past" className="py-16 bg-[var(--bg)]">
        <div className="w-full px-[6%]">
          <div className="text-[11px] tracking-[0.26em] uppercase text-white/70">Recap</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2 text-white">Past Events</h2>

          {eventsLoading && <div className="mt-6 text-sm text-white/70">Carico eventi...</div>}
          {eventsErr && <div className="mt-6 text-sm text-white/80">Errore: {eventsErr}</div>}

          <div className="mt-8 space-y-4">
            {pastYears.length === 0 ? (
              <div className="text-sm text-white/70">Nessun past event ancora.</div>
            ) : (
              pastYears.map((year) => (
                <details key={year} className="lv-details border border-white/12 bg-white/5">
                  <summary className="lv-summary cursor-pointer select-none px-6 py-4 flex items-center justify-between gap-4 text-red-300 hover:text-red-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="text-xs tracking-[0.22em] uppercase text-white/70">Year</div>
                      <div className="text-lg font-semibold text-white">{year}</div>
                      <div className="text-xs text-white/65">
                        {(pastByYear[year]?.length || 0)} event{(pastByYear[year]?.length || 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="lv-open text-xs tracking-[0.18em] uppercase">OPEN</div>
                  </summary>

                  <div className="lv-content px-6 pb-6">
                    <div className="grid lg:grid-cols-2 gap-6">
                      {(pastByYear[year] || []).map((e) => {
                        const yt = youTubeEmbedUrl(e.aftermovieUrl || "");
                        return (
                          <article key={e.id} className="bg-black/30 overflow-hidden border border-white/10">
                            <div className="relative aspect-[16/9] bg-black">
                              {yt ? (
                                <iframe
                                  className="absolute inset-0 z-20 h-full w-full"
                                  src={yt}
                                  title={`LedVelvet – ${e.name}`}
                                  loading="lazy"
                                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                  referrerPolicy="strict-origin-when-cross-origin"
                                />
                              ) : (
                                <img src={e.posterSrc} alt={e.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                              )}
                              <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                            </div>

                            <div className="p-6">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs tracking-[0.22em] uppercase text-white/70">
                                  {e.deepdiveSlug ? "Experience" : "Recap"}
                                </div>

                                <div className="flex items-center gap-2">
                                  {e.deepdiveSlug && e.deepdivePublished ? (
                                    <button
                                      onClick={() => {
                                        const params = new URLSearchParams(sp.toString());
                                        params.set("experience", e.deepdiveSlug!);
                                        params.set("ticketUrl", e.ticketUrl || "");
                                        params.set("city", e.city || "");
                                        params.set("dateLabel", fmtDateIT(e.date));
                                        router.replace(`/moment2?${params.toString()}`, { scroll: false });
                                      }}
                                      className="px-4 py-2 bg-white/10 border border-white/25 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/15 hover:border-white/40"
                                    >
                                      Enter the experience
                                    </button>
                                  ) : null}

                                  {yt ? (
                                    <a
                                      href={e.aftermovieUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-4 py-2 bg-[var(--red-accent)] text-black text-xs tracking-[0.18em] uppercase hover:opacity-90"
                                    >
                                      Watch recap
                                    </a>
                                  ) : (
                                    <span className="text-xs text-white/60">Recap in arrivo</span>
                                  )}
                                </div>
                              </div>

                              <h3 className="text-xl font-semibold mt-3 text-white">{e.name}</h3>
                              <div className="mt-2 text-sm text-white/70">
                                {e.city} • {fmtDateIT(e.date)}
                              </div>

                           {e.notes ? (
  <div className="mt-3">
    <div className="relative">
      <div
        className="text-sm text-white/75 leading-relaxed"
        style={
          expandedNotes[e.id]
            ? {}
            : {
                display: "-webkit-box",
                WebkitLineClamp: 3 as any,
                WebkitBoxOrient: "vertical" as any,
                overflow: "hidden",
              }
        }
      >
        {e.notes}
      </div>

      {/* fade “instagram” SOLO quando è chiuso e SOLO su mobile */}
      {!expandedNotes[e.id] ? (
        <div className="md:hidden pointer-events-none absolute left-0 right-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
      ) : null}
    </div>

    {e.notes.length > 160 ? (
      <button
        type="button"
        onClick={() => setExpandedNotes((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
        className="mt-2 text-xs uppercase tracking-[0.18em] text-white/60 hover:text-white"
      >
        {expandedNotes[e.id] ? "Mostra meno" : "Continua a leggere"}
      </button>
    ) : null}
  </div>
) : null}


                              {e.sponsors && e.sponsors.length > 0 ? (
                                <div className="mt-4">
                                  <div className="text-[10px] tracking-[0.26em] uppercase text-white/70">Sponsors</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {e.sponsors.map((s) => {
                                      const Wrapper: any = s.website ? "a" : "span";
                                      const wrapperProps = s.website ? { href: s.website, target: "_blank", rel: "noreferrer" } : {};
                                      return (
                                        <Wrapper
                                          key={s.id}
                                          {...wrapperProps}
                                          className={cn(
                                            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/25 bg-black/35 text-[11px] text-white/90",
                                            s.website && "hover:bg-white/10 hover:border-white/40"
                                          )}
                                          title={s.website || s.id}
                                        >
                                          {s.logoUrl ? (
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 border border-white/15 overflow-hidden">
                                              <img src={s.logoUrl} alt={s.label} className="w-full h-full object-cover" loading="lazy" />
                                            </span>
                                          ) : (
                                            <span className="w-5 h-5 rounded-full bg-white/10 border border-white/15" />
                                          )}
                                          <span className="leading-none">{s.label}</span>
                                        </Wrapper>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </details>
              ))
            )}
          </div>
        </div>

        <style suppressHydrationWarning>{`
          #past details > summary::-webkit-details-marker { display:none; }
          #past details > summary { list-style:none; }
          #past .lv-details { border-radius: 0px; }
          #past .lv-summary {
            position: relative;
            background: rgba(0,0,0,0.18);
            border-bottom: 1px solid rgba(255,255,255,0.10);
          }
          #past .lv-summary::before {
            content: "";
            position: absolute;
            left: 18px;
            right: 18px;
            top: 0;
            height: 1px;
            background: linear-gradient(90deg,
              rgba(255,255,255,0.00),
              rgba(255,45,45,0.55),
              rgba(255,255,255,0.00)
            );
            opacity: 0.85;
          }
          #past details[open] .lv-summary {
            color: #ff2b2b;
            background: rgba(0,0,0,0.28);
            border-bottom-color: rgba(255,255,255,0.14);
          }
          #past details[open] .lv-open {
            color: #ff2b2b;
            letter-spacing: 0.22em;
          }
          #past .lv-open { color: rgba(255,255,255,0.72); }
          #past .lv-content {
            overflow: hidden;
            max-height: 0px;
            opacity: 0;
            transform: translateY(-6px);
            transition: max-height 420ms ease, opacity 240ms ease, transform 240ms ease;
          }
          #past details[open] .lv-content {
            max-height: 3000px;
            opacity: 1;
            transform: translateY(0px);
          }
        `}</style>
      </section>

      <Marquee text="Sponsor · Partnerships · LedVelvet ·" />

      {/* SPONSOR REQUEST */}
      <section id="sponsor" className="py-16 bg-[var(--red-dark)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-[11px] tracking-[0.26em] uppercase text-white/80">Partnership</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2 text-white">Sponsor Request</h2>
          <p className="mt-4 text-sm md:text-base text-white/80 max-w-2xl">
            Vuoi sponsorizzare un evento LedVelvet? Compila la richiesta: ti rispondiamo con proposte e disponibilità.
          </p>

          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 p-6">
              <div className="text-xs tracking-[0.22em] uppercase text-white/70">Company</div>

              <label className="block mt-4 text-xs text-white/80">Brand / Azienda *</label>
              <input
                value={sponsor.brand}
                onChange={(e) => setSponsor((s) => ({ ...s, brand: e.target.value }))}
                className="mt-2 w-full bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="Brand Azienda"
              />

              <label className="block mt-4 text-xs text-white/80">Referente *</label>
              <input
                value={sponsor.name}
                onChange={(e) => setSponsor((s) => ({ ...s, name: e.target.value }))}
                className="mt-2 w-full bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="Nome e Cognome"
              />

              <label className="block mt-4 text-xs text-white/80">Email *</label>
              <input
                value={sponsor.email}
                onChange={(e) => setSponsor((s) => ({ ...s, email: e.target.value }))}
                className="mt-2 w-full bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="email@azienda.com"
              />

              <label className="block mt-4 text-xs text-white/80">Telefono</label>
              <input
                value={sponsor.phone}
                onChange={(e) => setSponsor((s) => ({ ...s, phone: e.target.value }))}
                className="mt-2 w-full bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="+39 ..."
              />
            </div>

            <div className="bg-white/5 border border-white/10 p-6">
              <div className="text-xs tracking-[0.22em] uppercase text-white/70">Details</div>

              <label className="block mt-4 text-xs text-white/80">Budget</label>
              <input
                value={sponsor.budget}
                onChange={(e) => setSponsor((s) => ({ ...s, budget: e.target.value }))}
                className="mt-2 w-full bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="Es. 500€ / 1000€ / 2000€"
              />

              <label className="block mt-4 text-xs text-white/80">Interest type</label>
              <select
                value={sponsor.interestType}
                onChange={(e) => setSponsor((s) => ({ ...s, interestType: e.target.value }))}
                className="mt-2 w-full bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              >
                <option value="">{metaLoading ? "Carico opzioni..." : "Seleziona (opzionale)"}</option>
                {interestOptions.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>

              <label className="block mt-4 text-xs text-white/80">Messaggio</label>
              <textarea
                value={sponsor.note}
                onChange={(e) => setSponsor((s) => ({ ...s, note: e.target.value }))}
                className="mt-2 w-full min-h-[120px] bg-black/30 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="Obiettivo, disponibilità, note…"
              />

              {sponsorSentErr ? <div className="mt-4 text-sm text-red-200">{sponsorSentErr}</div> : null}
              {sponsorSentOk ? <div className="mt-4 text-sm text-green-200">{sponsorSentOk}</div> : null}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={submitSponsorRequest}
                  disabled={sponsorSending}
                  className={cn(
                    "px-6 py-3 bg-[var(--red-accent)] text-black text-xs tracking-[0.18em] uppercase hover:opacity-90",
                    sponsorSending && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {sponsorSending ? "Invio..." : "Invia richiesta"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSponsorSentOk(null);
                    setSponsorSentErr(null);
                    setSponsor({ brand: "", name: "", email: "", phone: "", budget: "", note: "", interestType: "" });
                  }}
                  className="px-6 py-3 border border-white/20 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/10"
                >
                  Reset
                </button>
              </div>

              <div className="mt-4 text-xs text-white/55">
                Inviando accetti di essere ricontattato da LedVelvet per finalità organizzative e commerciali.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer (socials moved to header) */}
      <footer className="border-t border-white/10 py-10 bg-[var(--bg)]">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs tracking-[0.22em] uppercase text-white/60">
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> LedVelvet APS • Privacy • Cookie • Termini
          </p>
          <div className="text-xs tracking-[0.22em] uppercase text-white/40">Follow us on Instagram · TikTok · Telegram</div>
        </div>
      </footer>

      {/* Deep Dive Overlay */}
      <DeepDiveOverlay
        slug={deepDiveOpen?.slug || null}
        onClose={() => {
          const params = new URLSearchParams(sp.toString());
          params.delete("experience");
          params.delete("ticketUrl");
          params.delete("city");
          params.delete("dateLabel");
          const q = params.toString();
          router.replace(q ? `/moment2?${q}` : "/moment2", { scroll: false });
          setDeepDiveOpen(null);
        }}
        ticketUrl={ticketUrlQ || deepDiveOpen?.ticketUrl || ""}
        city={cityQ || deepDiveOpen?.city || ""}
        dateLabel={dateLabelQ || deepDiveOpen?.dateLabel || ""}
      />
    </div>
  );
}