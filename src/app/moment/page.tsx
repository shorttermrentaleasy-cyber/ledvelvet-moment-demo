"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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

type EventItem = {
  id: string;
  name: string;
  city: string;
  date: string;
  phase: "upcoming" | "past";
  ticketUrl?: string;

  teaserUrl?: string;
  aftermovieUrl?: string;
  featured?: boolean;

  tag?: string;
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

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatEUR(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
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

function youTubeEmbedUrl(urlRaw: string, autoplayMuted = false): string | null {
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

export default function MomentPage() {
  const palette = {
    bg: "#050508",
    surface: "#0B0B10",
    surface2: "#10101A",
    text: "#F6F6F7",
    muted: "#B9BAC2",
    border: "rgba(255,255,255,0.10)",
    accent: "#E11D48",
    accent2: "#FF2E63",
  } as const;

  const brand = {
    logo: "/logo.png",
    heroPoster: "/og.jpg",
    heroVideoMp4: "/media/petra_led.mp4",
    heroVideoWebm: "https://upload.wikimedia.org/wikipedia/commons/2/29/Wikimania_beach_party_2.webm",
  };

  const [user, setUser] = useState<{ email: string | null; level?: Level; kyc?: boolean }>({ email: null });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showKyc, setShowKyc] = useState(false);
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

  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsErr, setEventsErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadEvents() {
      setEventsLoading(true);
      setEventsErr(null);
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

              teaserUrl: e.teaserUrl || e["Teaser"] || "",
              aftermovieUrl: e.aftermovieUrl || e["Aftermovie"] || "",
              featured: Boolean(e.featured),

              tag: (e.status || e.tag || "").toString(),
              posterSrc: e.posterSrc || e["Hero Image"] || "/og.jpg",
              videoMp4: null,
            };
          })
          .filter((x) => x.name)
          .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

        setEvents(norm);
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
  }, []);

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

    const fn =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen ||
      null;

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

  const upcomingEvents = events.filter((e) => e.phase === "upcoming");
  const pastEvents = events.filter((e) => e.phase === "past");

  const nextUpcoming = useMemo(() => {
    const list = [...upcomingEvents].filter((e) => e.date).sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    return list[0] || null;
  }, [upcomingEvents]);

  const featuredEvent = useMemo(() => {
    const f = events.find((e) => e.featured);
    return f || null;
  }, [events]);

  const heroEvent = featuredEvent || nextUpcoming;

  const heroYouTube = useMemo(() => {
  const url = heroEvent?.teaserUrl || heroEvent?.aftermovieUrl || "";
  return youTubeEmbedUrl(url, true); // autoplay + muted (best effort)
}, [heroEvent]);

  const pastByYear = useMemo(() => {
    const map: Record<string, EventItem[]> = {};
    for (const e of pastEvents) {
      const y = getYearSafe(e.date);
      const key = y ? String(y) : "Other";
      (map[key] ||= []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k] = [...map[k]].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
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

  const { subtotal, discountRate, discount, shipping, total } = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const level = user.level || (user.email ? "BASE" : undefined);
    const discountRate = level === "FOUNDER" ? 0.15 : level === "VIP" ? 0.1 : level === "BASE" ? 0.05 : 0;
    const discount = Math.round(subtotal * discountRate * 100) / 100;
    const shipping = subtotal - discount > 0 && subtotal - discount < 60 ? 5 : 0;
    const total = Math.max(0, Math.round((subtotal - discount + shipping) * 100) / 100);
    return { subtotal, discountRate, discount, shipping, total };
  }, [cart, user.level, user.email]);

  function addToCart(p: Product) {
    const chosen = selectedSize[p.sku] || p.sizes[0];
    const stock = p.stock?.[chosen] ?? 999;

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

  function incQty(idx: number) {
    setCart((c) => {
      const next = [...c];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  }

  function decQty(idx: number) {
    setCart((c) => {
      const next = [...c];
      const q = next[idx].qty - 1;
      if (q <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: q };
      return next;
    });
  }

  function removeFromCart(index: number) {
    setCart((c) => c.filter((_, i) => i !== index));
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

  const tier = user.level || (user.email ? "BASE" : undefined);
  const tierLabel = tier ? `SOCIO ${tier}` : "VISITATORE";

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--text)] selection:bg-[var(--accent)] selection:text-black"
      style={{
        ["--bg" as any]: palette.bg,
        ["--surface" as any]: palette.surface,
        ["--surface2" as any]: palette.surface2,
        ["--text" as any]: palette.text,
        ["--muted" as any]: palette.muted,
        ["--border" as any]: palette.border,
        ["--accent" as any]: palette.accent,
        ["--accent2" as any]: palette.accent2,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(900px circle at 15% 10%, rgba(225,29,72,0.22), transparent 55%), radial-gradient(700px circle at 85% 15%, rgba(255,46,99,0.16), transparent 52%), radial-gradient(900px circle at 50% 90%, rgba(225,29,72,0.10), transparent 55%)",
        }}
      />

      {/* STICKY HEADER (desktop + mobile) */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[var(--surface)]/90 backdrop-blur">
        {/* Top mini-bar */}
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between text-xs tracking-wide">
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <span className="uppercase">Cart reserved for</span>
            <span className="font-medium">·</span>
            <button
              className="underline underline-offset-4 hover:text-[var(--text)]"
              onClick={() => setCartTimerMin((m) => (m >= 30 ? 10 : m + 5))}
              title="Demo: incrementa timer"
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
              Cart ({formatEUR(total)})
            </button>
          </div>
        </div>

        {/* Main bar */}
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={brand.logo} alt="LedVelvet" className="w-10 h-10 rounded-full border border-white/10" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">LedVelvet</div>
              <div className="text-xs text-white/60 tracking-[0.18em] uppercase">Moment</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
            <a href="#home" className="hover:text-[var(--text)]">Home</a>
            <a href="#eventi" className="hover:text-[var(--text)]">Upcoming</a>
            <a href="#past" className="hover:text-[var(--text)]">Past</a>
            <a href="#membership" className="hover:text-[var(--text)]">Membership</a>
            <a href="#shop" className="hover:text-[var(--text)]">Shop</a>
            <a href="#sponsor" className="hover:text-[var(--text)]">Sponsor</a>
          </nav>

          <div className="flex items-center gap-2">
            {!user.email ? (
              <button
                onClick={() => setUser({ email: "demo@ledvelvet.it", level: "BASE" })}
                className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
                type="button"
              >
                Accedi (demo)
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="bg-transparent rounded-full px-3 py-2 text-xs tracking-[0.18em] uppercase border border-white/15 text-[var(--text)]"
                  value={user.level || "BASE"}
                  onChange={(e) => setUser((u) => ({ ...u, level: e.target.value as Level }))}
                >
                  <option value="BASE">BASE</option>
                  <option value="VIP">VIP</option>
                  <option value="FOUNDER">FOUNDER</option>
                </select>
                <button
                  onClick={() => setUser({ email: null })}
                  className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
                  type="button"
                >
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu row (always visible on mobile) */}
        <div className="md:hidden border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-2 flex gap-5 overflow-x-auto text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
            <a href="#home" className="shrink-0 hover:text-[var(--text)]">Home</a>
            <a href="#eventi" className="shrink-0 hover:text-[var(--text)]">Upcoming</a>
            <a href="#past" className="shrink-0 hover:text-[var(--text)]">Past</a>
            <a href="#membership" className="shrink-0 hover:text-[var(--text)]">Membership</a>
            <a href="#shop" className="shrink-0 hover:text-[var(--text)]">Shop</a>
            <a href="#sponsor" className="shrink-0 hover:text-[var(--text)]">Sponsor</a>
          </div>
        </div>
      </div>

      {/* HERO */}
      <section id="home" className="pt-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[var(--surface2)]">
            <div className="relative aspect-[9/16] sm:aspect-[16/7] w-full bg-black">
              {heroYouTube ? (
                <iframe
                  className="absolute inset-0 z-30 h-full w-full"
                  src={heroYouTube}
                  title={heroEvent?.name ? `LedVelvet – ${heroEvent.name}` : "LedVelvet"}
                  loading="lazy"
                  allow="autoplay, accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : heroEvent ? (
                <img
                  src={heroEvent.posterSrc || brand.heroPoster}
                  alt={heroEvent.name || "LedVelvet"}
                  className="absolute inset-0 z-20 h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <video
                  ref={heroVideoRef}
                  className="absolute inset-0 z-20 h-full w-full object-cover"
                  poster={brand.heroPoster}
                  autoPlay
                  loop
                  muted={muted}
                  playsInline
                  preload="metadata"
                >
                  <source src={brand.heroVideoMp4} type="video/mp4" />
                  <source src={brand.heroVideoWebm} type="video/webm" />
                </video>
              )}

              {/* Base poster */}
              <img src={brand.heroPoster} alt="LedVelvet" className="absolute inset-0 z-0 h-full w-full object-cover" loading="eager" />

              {/* IMPORTANT: overlays must NOT block clicks on YouTube iframe */}
              <div className="pointer-events-none absolute inset-0 z-40 bg-gradient-to-t from-black/95 via-black/55 to-black/15" />
              <div
                className="pointer-events-none absolute inset-0 z-40 opacity-60"
                style={{ background: "radial-gradient(800px circle at 20% 60%, rgba(225,29,72,0.18), transparent 60%)" }}
              />

              {/* Labels should not block iframe clicks */}
              {heroEvent?.name ? (
                <div className="pointer-events-none absolute left-5 bottom-5 z-50">
                  <div className="text-[11px] tracking-[0.22em] uppercase text-white/70">Featured</div>
                  <div className="mt-1 text-lg sm:text-xl font-semibold">{heroEvent.name}</div>
                  <div className="mt-1 text-sm text-white/65">
                    {heroEvent.city ? `${heroEvent.city} • ` : ""}{fmtDateIT(heroEvent.date)}
                  </div>
                </div>
              ) : null}

              {/* Controls ONLY for default mp4 hero */}
              {!heroYouTube && !heroEvent ? (
                <div className="absolute left-3 right-3 bottom-3 z-50 rounded-2xl border border-white/10 bg-black/35 backdrop-blur px-3 py-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-white/60">Aftermovie loop (demo)</div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1.5 rounded-full border border-white/15 hover:bg-white/10 text-[11px] tracking-[0.18em] uppercase"
                      onClick={toggleMute}
                      type="button"
                    >
                      {muted ? "Unmute" : "Mute"}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-full border border-white/15 hover:bg-white/10 text-[11px] tracking-[0.18em] uppercase"
                      onClick={requestHeroFullscreen}
                      type="button"
                    >
                      Fullscreen
                    </button>
                  </div>
                </div>
              ) : null}

              {fsErr ? (
                <div className="absolute left-3 right-3 bottom-3 z-50 rounded-2xl border border-white/10 bg-black/60 backdrop-blur px-3 py-2 text-xs text-white/80">
                  {fsErr}
                </div>
              ) : null}
            </div>

            <div className="p-7 sm:p-9">
              <div className="text-xs tracking-[0.22em] uppercase text-white/70">Ethereal clubbing in unconventional places</div>
              <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mt-2">Moments that feel like a movie.</h1>
              <p className="mt-4 text-white/70 max-w-2xl">
                Aftermovies, prossimi eventi e membership. Un’unica pagina “show & sell” in stile dark/neon.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#eventi"
                  className="px-6 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                  style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                >
                  Prossimi eventi
                </a>
                <a
                  href="#past"
                  className="px-6 py-3 rounded-full border border-white/15 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/10"
                >
                  Guarda i recap
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* UPCOMING */}
      <section id="eventi" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-xs tracking-[0.22em] uppercase text-white/70">Next</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Upcoming</h2>

          {eventsLoading && <div className="mt-6 text-sm text-white/60">Carico eventi...</div>}
          {eventsErr && <div className="mt-6 text-sm text-red-200">Errore: {eventsErr}</div>}

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {upcomingEvents.map((e) => {
              const tag = (e.tag || "LISTE & TICKETS").toUpperCase();
              const soldOut = tag.includes("SOLD");
              return (
                <article key={e.id} className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
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

                    <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs tracking-[0.22em] uppercase text-white/60">{tag}</div>

                      {soldOut ? (
                        <span className="text-xs text-white/40">Sold out</span>
                      ) : e.ticketUrl ? (
                        <a
                          href={e.ticketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)] hover:border-[var(--accent)]"
                          style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset" }}
                        >
                          Book
                        </a>
                      ) : (
                        <span className="text-xs text-white/40">Ticket soon</span>
                      )}
                    </div>

                    <h3 className="text-xl font-semibold mt-3">{e.name}</h3>
                    <div className="mt-2 text-sm text-white/65">
                      {e.city} • {fmtDateIT(e.date)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* PAST */}
      <section id="past" className="py-16 border-y border-white/10 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-xs tracking-[0.22em] uppercase text-white/70">Recap</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Past Events</h2>

          {eventsLoading && <div className="mt-6 text-sm text-white/60">Carico eventi...</div>}
          {eventsErr && <div className="mt-6 text-sm text-red-200">Errore: {eventsErr}</div>}

          <div className="mt-8 space-y-4">
            {pastYears.length === 0 ? (
              <div className="text-sm text-white/60">Nessun past event ancora.</div>
            ) : (
              pastYears.map((year, idx) => (
                <details
                  key={year}
                  open={idx === 0}
                  className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden"
                >
                  <summary className="cursor-pointer select-none px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-xs tracking-[0.22em] uppercase text-white/70">Year</div>
                      <div className="text-lg font-semibold">{year}</div>
                      <div className="text-xs text-white/45">
                        {(pastByYear[year]?.length || 0)} event{(pastByYear[year]?.length || 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-xs text-white/45">Toggle</div>
                  </summary>

                  <div className="px-6 pb-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      {(pastByYear[year] || []).map((e) => {
                        const yt = youTubeEmbedUrl(e.aftermovieUrl || "");
                        return (
                          <article key={e.id} className="rounded-[28px] border border-white/10 bg-black/20 overflow-hidden">
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
                                <div className="text-xs tracking-[0.22em] uppercase text-white/60">Recap</div>
                                {yt ? (
                                  <a
                                    href={e.aftermovieUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)] hover:border-[var(--accent)]"
                                    style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset" }}
                                  >
                                    Watch recap
                                  </a>
                                ) : (
                                  <span className="text-xs text-white/40">Recap in arrivo</span>
                                )}
                              </div>

                              <h3 className="text-xl font-semibold mt-3">{e.name}</h3>
                              <div className="mt-2 text-sm text-white/65">
                                {e.city} • {fmtDateIT(e.date)}
                              </div>
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
      </section>

      {/* MEMBERSHIP */}
      <section id="membership" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="rounded-[28px] border border-white/10 bg-[var(--surface2)] p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-white/70">Join the circle</div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Membership</h2>
                <p className="mt-4 text-white/70">
                  Accesso prioritario, drop merch, early RSVP. (Demo UI.)
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    className="px-6 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                    style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                    onClick={() => setShowKyc(true)}
                    type="button"
                  >
                    Start KYC (demo)
                  </button>

                  <a
                    className="px-6 py-3 rounded-full border border-white/15 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/10"
                    href="#shop"
                  >
                    Shop drop
                  </a>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                <div className="text-xs tracking-[0.22em] uppercase text-white/70">Your status</div>
                <div className="mt-2 text-2xl font-semibold">{tierLabel}</div>
                <p className="mt-3 text-white/65 text-sm">(Demo) Accedi e scegli livello.</p>

                <div className="mt-6 space-y-3 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <span>Discount rate</span>
                    <span className="font-medium">{Math.round(discountRate * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>KYC</span>
                    <span className="font-medium">{user.kyc ? "Verified" : "Not verified"}</span>
                  </div>
                </div>

                <div className="mt-6 text-xs text-white/45">
                  UI only.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SHOP */}
      <section id="shop" className="py-16 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-xs tracking-[0.22em] uppercase text-white/70">Drop</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Shop</h2>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {products.map((p) => (
              <article key={p.sku} className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
                <div className="relative aspect-[4/3] bg-black">
                  <img src={p.image} alt={p.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
                </div>

                <div className="p-6">
                  <div className="text-xs tracking-[0.22em] uppercase text-white/60">{p.sku}</div>
                  <h3 className="text-lg font-semibold mt-2">{p.name}</h3>
                  <div className="mt-2 text-sm text-white/70">{formatEUR(p.price)}</div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <select
                      className="bg-transparent rounded-full px-3 py-2 text-xs tracking-[0.18em] uppercase border border-white/15 text-[var(--text)]"
                      value={selectedSize[p.sku] || p.sizes[0]}
                      onChange={(e) => setSelectedSize((s) => ({ ...s, [p.sku]: e.target.value }))}
                    >
                      {p.sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <button
                      className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)] hover:border-[var(--accent)]"
                      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset" }}
                      onClick={() => addToCart(p)}
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {showCart && (
            <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-4xl rounded-[28px] border border-white/10 bg-[var(--surface)] overflow-hidden">
                <div className="p-5 flex items-center justify-between border-b border-white/10">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase text-white/70">Your cart</div>
                    <div className="text-sm text-white/60 mt-1">Reserved for {cartTimerMin} min (demo)</div>
                  </div>
                  <button
                    className="px-4 py-2 rounded-full border border-white/15 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
                    onClick={() => setShowCart(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                <div className="grid md:grid-cols-[1fr_360px] gap-0">
                  <div className="p-5">
                    {cart.length === 0 ? (
                      <div className="text-sm text-white/60">Carrello vuoto.</div>
                    ) : (
                      <div className="space-y-4">
                        {cart.map((i, idx) => (
                          <div key={`${i.sku}-${i.size}-${idx}`} className="rounded-[22px] border border-white/10 bg-[var(--surface2)] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-sm font-semibold">{i.name}</div>
                                <div className="text-xs text-white/60 mt-1">
                                  {i.sku} • size {i.size || "UNI"}
                                </div>
                              </div>
                              <button
                                className="text-xs text-white/50 hover:text-white underline underline-offset-4"
                                onClick={() => removeFromCart(idx)}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button className="w-9 h-9 rounded-full border border-white/15 hover:bg-white/10" onClick={() => decQty(idx)} type="button">-</button>
                                <div className="w-10 text-center text-sm">{i.qty}</div>
                                <button className="w-9 h-9 rounded-full border border-white/15 hover:bg-white/10" onClick={() => incQty(idx)} type="button">+</button>
                              </div>
                              <div className="text-sm font-medium">{formatEUR(i.qty * i.price)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <aside className="p-5 border-t md:border-t-0 md:border-l border-white/10">
                    <div className="rounded-[28px] border border-white/10 bg-[var(--surface2)] p-5 text-sm space-y-2">
                      <div className="flex items-center justify-between"><span className="text-white/70">Subtotale</span><span>{formatEUR(subtotal)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-white/70">Sconto soci {Math.round(discountRate * 100)}%</span><span>-{formatEUR(discount)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-white/70">Spedizione</span><span>{formatEUR(shipping)}</span></div>
                      <div className="flex items-center justify-between text-base font-semibold"><span>Totale</span><span>{formatEUR(total)}</span></div>

                      <button
                        className="w-full mt-3 px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                        onClick={() => alert(`Redirect a Stripe Checkout (demo) – Totale ${formatEUR(total)}`)}
                        style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                        type="button"
                      >
                        Procedi al pagamento
                      </button>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SPONSOR */}
      <section id="sponsor" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="rounded-[28px] border border-white/10 bg-[var(--surface2)] p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-white/70">Become a partner</div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Sponsor Area</h2>
                <p className="mt-4 text-white/70">Compila il form: la richiesta viene salvata su Airtable e inviata via email al team.</p>
              </div>

              <div className="space-y-3">
                <input
                  value={sponsor.brand}
                  onChange={(e) => setSponsor((s) => ({ ...s, brand: e.target.value }))}
                  placeholder="Brand / Azienda"
                  className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
                <input
                  value={sponsor.name}
                  onChange={(e) => setSponsor((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Referente"
                  className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
                <input
                  value={sponsor.email}
                  onChange={(e) => setSponsor((s) => ({ ...s, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
                <input
                  value={sponsor.phone}
                  onChange={(e) => setSponsor((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="Telefono (opzionale)"
                  className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
                <input
                  value={sponsor.budget}
                  onChange={(e) => setSponsor((s) => ({ ...s, budget: e.target.value }))}
                  placeholder="Budget (opzionale)"
                  className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />

                <select
                  className="w-full bg-transparent rounded-2xl px-4 py-3 text-sm border border-white/10 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  value={sponsor.interestType}
                  onChange={(e) => setSponsor((s) => ({ ...s, interestType: e.target.value }))}
                >
                  <option value="">Interest type (opzionale)</option>
                  {interestOptions.map((o) => (
                    <option key={o.id || o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>

                <textarea
                  value={sponsor.note}
                  onChange={(e) => setSponsor((s) => ({ ...s, note: e.target.value }))}
                  placeholder="Note / obiettivi / idee (opzionale)"
                  rows={5}
                  className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
                />

                {sponsorSentErr && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{sponsorSentErr}</div>}
                {sponsorSentOk && <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{sponsorSentOk}</div>}

                <button
                  type="button"
                  onClick={submitSponsorRequest}
                  disabled={sponsorSending}
                  className={cn(
                    "w-full px-5 py-3 rounded-full text-white text-xs tracking-[0.18em] uppercase transition",
                    sponsorSending ? "bg-white/10 cursor-not-allowed" : "bg-[var(--accent)] hover:bg-[var(--accent2)]"
                  )}
                  style={!sponsorSending ? { boxShadow: "0 10px 30px rgba(225,29,72,0.20)" } : undefined}
                >
                  {sponsorSending ? "Invio..." : "Invia richiesta sponsor"}
                </button>

                <div className="pt-2 text-[11px] text-white/40">
                  {metaLoading ? "Carico opzioni da Airtable..." : interestOptions.length === 0 ? "Opzioni Airtable non disponibili (ok comunque)." : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KYC MODAL (demo) */}
      {showKyc && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[var(--surface)] overflow-hidden">
            <div className="p-5 flex items-center justify-between border-b border-white/10">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-white/70">KYC</div>
                <div className="text-sm text-white/60 mt-1">Demo modal</div>
              </div>
              <button
                className="px-4 py-2 rounded-full border border-white/15 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
                onClick={() => setShowKyc(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-white/70">UI only.</p>

              <div className="mt-5 flex gap-3">
                <button
                  className="px-6 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                  style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                  onClick={() => setUser((u) => ({ ...u, kyc: true }))}
                  type="button"
                >
                  Mark verified (demo)
                </button>
                <button
                  className="px-6 py-3 rounded-full border border-white/15 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/10"
                  onClick={() => setUser((u) => ({ ...u, kyc: false }))}
                  type="button"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-white/10 py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs tracking-[0.22em] uppercase text-white/60">© {new Date().getFullYear()} LedVelvet APS • Privacy • Cookie • Termini</p>
          <div className="flex gap-4 text-xs tracking-[0.22em] uppercase text-white/60">
            <a className="hover:text-white" href="#">Instagram</a>
            <a className="hover:text-white" href="#">TikTok</a>
            <a className="hover:text-white" href="#">Press Kit</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
