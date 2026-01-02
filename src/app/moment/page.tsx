"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * LedVelvet – /moment – DARK EDITION (single-file)
 * Updates:
 * - Events loaded from Airtable via /api/public/events
 * - Past/Upcoming split by Airtable field "Phase" (past/upcoming)
 * - Past events "Watch recap" uses Aftermovie URL (YouTube recommended)
 * - Sponsor request source set to "website"
 */

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
  date: string; // ISO from Airtable recommended
  phase: "upcoming" | "past";
  ticketUrl?: string;
  aftermovieUrl?: string;
  tag?: string; // e.g. SOLD OUT / RECAP
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

  // Sponsor meta options
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

  // EVENTS from Airtable
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

        // supporto sia "events" che "items" (nel caso tu abbia ancora una vecchia route deployata)
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
              aftermovieUrl: e.aftermovieUrl || e.aftermovie || e["Aftermovie"] || "",
              tag: (e.status || e.tag || "").toString(),
              posterSrc: e.posterSrc || e.heroImage || e["Hero Image"] || "/og.jpg",
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

  // Load "interest type" options from Airtable via meta API
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

      <div className="sticky top-0 z-50 border-b border-white/10 bg-[var(--surface)]/85 backdrop-blur">
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
      </div>

      <header className="sticky top-8 z-40 bg-[var(--surface)]/60 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <img src={brand.logo} alt="LedVelvet" className="w-8 h-8 rounded-full border border-white/15 object-cover" />
            <span className="text-sm tracking-[0.25em] uppercase">LedVelvet</span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
            <a href="#home" className="hover:text-[var(--text)]">Home</a>
            <a href="#eventi" className="hover:text-[var(--text)]">Momenti</a>
            <a href="#past" className="hover:text-[var(--text)]">Past events</a>
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
      </header>

      {/* HERO */}
      <section id="home" className="pt-6">
        <div className="max-w-6xl mx-auto px-4">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[var(--surface2)]">
            <div className="relative aspect-[9/16] sm:aspect-[16/7] w-full bg-black">
              <video
                ref={heroVideoRef}
                className="absolute inset-0 z-10 h-full w-full object-cover"
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

              <img src={brand.heroPoster} alt="LedVelvet" className="absolute inset-0 z-0 h-full w-full object-cover" loading="eager" />
              <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/95 via-black/55 to-black/15" />
              <div className="absolute inset-0 z-20 opacity-60" style={{ background: "radial-gradient(800px circle at 20% 60%, rgba(225,29,72,0.18), transparent 60%)" }} />

              <div className="absolute right-3 top-3 z-40 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="px-3 py-2 rounded-full border border-white/15 bg-black/40 text-white text-[10px] tracking-[0.22em] uppercase hover:bg-black/60 active:scale-[0.99]"
                  style={{ backdropFilter: "blur(10px)" as any }}
                >
                  {muted ? "Audio off" : "Audio on"}
                </button>
                <button
                  type="button"
                  onClick={requestHeroFullscreen}
                  className="px-3 py-2 rounded-full border border-white/15 bg-black/40 text-white text-[10px] tracking-[0.22em] uppercase hover:bg-black/60 active:scale-[0.99]"
                  style={{ backdropFilter: "blur(10px)" as any }}
                >
                  Fullscreen
                </button>
              </div>

              {fsErr && (
                <div className="absolute left-3 right-3 bottom-3 z-40 rounded-2xl border border-white/10 bg-black/60 p-3 text-xs text-white/75">
                  {fsErr}
                </div>
              )}
            </div>

            <div className="absolute inset-0 z-30 flex items-end text-white">
              <div className="w-full p-4 sm:p-6 md:p-10">
                <div className="flex flex-col gap-3 max-w-3xl rounded-[24px] bg-black/55 backdrop-blur-md border border-white/10 p-4 sm:p-6 md:p-7">
                  <div className="text-[10px] sm:text-xs tracking-[0.22em] uppercase text-white/80">
                    Ethereal clubbing in unconventional places
                  </div>

                  <h1 className="text-3xl sm:text-4xl md:text-6xl leading-[0.95] font-semibold tracking-tight">
                    A Night You Don’t Repeat.
                    <span className="block text-white/80">You Remember.</span>
                  </h1>

                  <p className="max-w-2xl text-xs sm:text-sm md:text-base text-white/75">
                    Iscriviti alla membership APS, accedi alle pre-sale e sblocca sconti merch. Ticketing eventi via piattaforme esterne (Xceed/Shotgun) con CRM unificato sul sito.
                  </p>

                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-2">
                    <a
                      href="#eventi"
                      className="w-full sm:w-auto px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)] text-center"
                      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 12px 38px rgba(225,29,72,0.25)" }}
                    >
                      Discover moments
                    </a>

                    <a
                      href="#membership"
                      className="w-full sm:w-auto px-5 py-3 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30 text-center"
                    >
                      Join membership
                    </a>

                    <a
                      href="#shop"
                      className="w-full sm:w-auto px-5 py-3 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30 text-center"
                    >
                      Shop the drop
                    </a>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-white/12 to-transparent" />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-10">
            {[
              { t: "Once in a lifetime", d: "Location particolari, atmosfere rare, dettagli curati." },
              { t: "Renowned artists", d: "Lineup selezionate, set intimi e sorprese." },
              { t: "Community access", d: "Priority list, presale e benefici per soci." },
            ].map((x) => (
              <div key={x.t} className="rounded-[22px] border border-white/10 bg-[var(--surface2)] p-6">
                <div className="text-xs tracking-[0.22em] uppercase text-white/80">{x.t}</div>
                <div className="mt-2 text-sm text-white/70">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UPCOMING */}
      <section id="eventi" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs tracking-[0.22em] uppercase text-white/70">Choose your moment</div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Prossimi Eventi</h2>
            </div>
            <div className="text-xs tracking-[0.22em] uppercase text-white/50">tickets via Xceed / Shotgun</div>
          </div>

          {eventsLoading && <div className="mt-6 text-sm text-white/60">Carico eventi...</div>}
          {eventsErr && <div className="mt-6 text-sm text-red-200">Errore: {eventsErr}</div>}

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {upcomingEvents.map((e) => {
              const tag = (e.tag || "LISTE & TICKETS").toUpperCase();
              const soldOut = tag.includes("SOLD");
              return (
                <article key={e.id} className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
                  <div className="relative aspect-[16/9] bg-black">
                    <video
                      className="absolute inset-0 z-10 h-full w-full object-cover"
                      poster={e.posterSrc}
                      autoPlay
                      loop
                      muted={muted}
                      playsInline
                      preload="metadata"
                    >
                      <source src={e.videoMp4 || brand.heroVideoMp4} type="video/mp4" />
                      <source src={brand.heroVideoWebm} type="video/webm" />
                    </video>

                    <img src={e.posterSrc} alt={e.name} className="absolute inset-0 z-0 h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                    <div className="absolute inset-0 z-20 opacity-70" style={{ background: "radial-gradient(700px circle at 20% 80%, rgba(225,29,72,0.14), transparent 60%)" }} />
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
          <p className="mt-3 text-white/65 text-sm">Una timeline “di credibilità”: mostra cosa avete già fatto (foto/recap/video).</p>

          {eventsLoading && <div className="mt-6 text-sm text-white/60">Carico eventi...</div>}
          {eventsErr && <div className="mt-6 text-sm text-red-200">Errore: {eventsErr}</div>}

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {pastEvents.map((e) => (
              <article key={e.id} className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
                <div className="relative aspect-[16/9] bg-black">
                  <img src={e.posterSrc} alt={e.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                  <div className="absolute left-4 top-4 px-3 py-1 rounded-full text-[10px] tracking-[0.22em] uppercase border border-white/15 bg-black/40 text-white/80">
                    {(e.tag || "RECAP").toString().toUpperCase()}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-xl font-semibold">{e.name}</h3>
                  <div className="mt-2 text-sm text-white/65">
                    {e.city} • {fmtDateIT(e.date)}
                  </div>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    {e.aftermovieUrl ? (
                      <a
                        href={e.aftermovieUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-full bg-white/10 text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)]"
                        style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset" }}
                      >
                        Watch recap
                      </a>
                    ) : (
                      <span className="text-xs text-white/40">Recap in arrivo</span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* MEMBERSHIP */}
      <section id="membership" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.22em] uppercase text-white/70">What is a membership?</div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Membership APS</h2>
            <p className="mt-4 text-white/70">Onboarding con verifica documento (KYC light), tessera digitale con benefici per livello.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {([
              { code: "BASE" as const, price: 39, perks: ["Tessera digitale", "Pre-sale 15'", "Sconto Shop 5%"] },
              { code: "VIP" as const, price: 99, perks: ["Priority list", "Pre-sale 60'", "Sconto Shop 10%", "Eventi solo soci"] },
              { code: "FOUNDER" as const, price: 199, perks: ["Badge Founder", "Inviti speciali", "Sconto Shop 15%", "Meet & Greet"] },
            ]).map((m) => (
              <div
                key={m.code}
                className="rounded-[28px] border border-white/10 bg-[var(--surface2)] p-6 flex flex-col"
                style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset" }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-xs tracking-[0.22em] uppercase text-white/70">{m.code}</div>
                  <div className="text-lg font-semibold">{formatEUR(m.price)}/anno</div>
                </div>

                <ul className="mt-4 space-y-2 text-sm text-white/80">
                  {m.perks.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowKyc(true)}
                    className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30"
                    type="button"
                  >
                    KYC
                  </button>

                  <button
                    onClick={() => alert(`Checkout membership ${m.code} (demo)`)}
                    className="px-4 py-2 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                    style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                    type="button"
                  >
                    Join
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showKyc && (
            <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={() => setShowKyc(false)}>
              <div className="w-full max-w-lg rounded-[28px] bg-[var(--surface2)] border border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase text-white/60">KYC</div>
                    <h4 className="text-xl font-semibold mt-1">Dati Socio</h4>
                  </div>
                  <button className="px-3 py-1 rounded-full border border-white/15 text-xs hover:bg-white/10" onClick={() => setShowKyc(false)} type="button">
                    Chiudi
                  </button>
                </div>

                <div className="grid gap-3 mt-5">
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Nome" className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40" />
                    <input placeholder="Cognome" className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40" />
                  </div>

                  <input placeholder="Codice Fiscale" className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40" />

                  <input type="date" className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-white/80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40" />

                  <label className="text-sm text-white/70 flex items-center gap-2">
                    <input type="checkbox" /> Consenso privacy/GDPR
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button className="px-5 py-3 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30" onClick={() => setShowKyc(false)} type="button">
                    Annulla
                  </button>

                  <button
                    className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                    onClick={() => {
                      setUser((u) => ({ ...u, kyc: true, email: u.email ?? "demo@ledvelvet.it", level: u.level ?? "BASE" }));
                      setShowKyc(false);
                    }}
                    style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.22)" }}
                    type="button"
                  >
                    Invia
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SHOP */}
      <section id="shop" className="py-16 border-y border-white/10 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs tracking-[0.22em] uppercase text-white/70">Merchandise</div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Shop</h2>
              <p className="mt-3 text-white/70 text-sm">
                Sconti soci: BASE 5% • VIP 10% • FOUNDER 15% — Spedizione {formatEUR(5)} (gratis oltre {formatEUR(60)}).
              </p>
            </div>

            <button
              className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
              onClick={() => setShowCart(true)}
              style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
              type="button"
            >
              Checkout ({formatEUR(total)})
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {products.map((p) => (
              <div key={p.sku} className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
                <div className="relative aspect-square overflow-hidden bg-black">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15" />
                  <div className="absolute left-4 top-4 px-3 py-1 rounded-full text-[10px] tracking-[0.22em] uppercase border border-white/15 bg-black/40 text-white/80" style={{ backdropFilter: "blur(8px)" as any }}>
                    Demo drop
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs tracking-[0.22em] uppercase text-white/60">{p.sku}</div>
                      <div className="text-lg font-semibold mt-1">{p.name}</div>
                    </div>
                    <div className="text-sm font-medium">{formatEUR(p.price)}</div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs tracking-[0.22em] uppercase text-white/60">Size</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.sizes.map((s) => {
                        const inStock = (p.stock?.[s] ?? 0) > 0;
                        const active = (selectedSize[p.sku] || p.sizes[0]) === s;
                        return (
                          <button
                            key={s}
                            disabled={!inStock}
                            onClick={() => setSelectedSize((m) => ({ ...m, [p.sku]: s }))}
                            className={cn(
                              "px-3 py-1 rounded-full border text-xs tracking-[0.18em] uppercase",
                              active ? "bg-white/10 text-white border-white/25" : "border-white/15 text-white/80 hover:bg-white/10 hover:border-white/30",
                              !inStock && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-inherit"
                            )}
                            type="button"
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs text-white/55">Stock: {p.stock?.[(selectedSize[p.sku] || p.sizes[0]) as any] ?? "–"}</div>
                  </div>

                  <button
                    onClick={() => addToCart(p)}
                    className="mt-5 w-full px-5 py-3 rounded-full bg-white/10 text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)]"
                    style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset" }}
                    type="button"
                  >
                    Add to cart
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showCart && (
            <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={() => setShowCart(false)}>
              <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--surface)] border-l border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase text-white/60">Cart</div>
                    <h3 className="text-2xl font-semibold mt-1">Il tuo carrello</h3>
                    <div className="mt-2 text-xs text-white/55">Reservation time: {cartTimerMin} min (demo)</div>
                  </div>
                  <button className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10" onClick={() => setShowCart(false)} type="button">
                    Chiudi
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {cart.length === 0 && <p className="text-sm text-white/60">Il carrello è vuoto.</p>}
                  {cart.map((i, idx) => (
                    <div key={`${i.sku}-${i.size}-${idx}`} className="rounded-[22px] border border-white/10 bg-[var(--surface2)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">
                            {i.name} {i.size ? `(${i.size})` : ""}
                          </div>
                          <div className="text-xs text-white/55 mt-1">{formatEUR(i.price)} cad.</div>
                        </div>
                        <button className="text-xs underline underline-offset-4 text-white/60 hover:text-white" onClick={() => removeFromCart(idx)} type="button">
                          Rimuovi
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

                <div className="mt-6 rounded-[28px] border border-white/10 bg-[var(--surface2)] p-5 text-sm space-y-2">
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

                <div className="mt-6 rounded-[22px] border border-white/10 bg-black/25 p-5">
                  <div className="text-xs tracking-[0.22em] uppercase text-white/60">Cosa offriamo</div>
                  <ul className="mt-3 space-y-2 text-sm text-white/75">
                    <li>• Visibilità su pagina evento + social + recap.</li>
                    <li>• Product placement e corner in location (quando possibile).</li>
                    <li>• Pacchetti personalizzati per brand (budget-based).</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/25 p-6">
                <div className="text-xs tracking-[0.22em] uppercase text-white/60">Sponsor request</div>

                <div className="mt-4 grid gap-3">
                  <input
                    value={sponsor.brand}
                    onChange={(e) => setSponsor((s) => ({ ...s, brand: e.target.value }))}
                    placeholder="Brand / Azienda *"
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />

                  <div className="grid gap-1">
                    <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Interest type</div>
                    <select
                      value={sponsor.interestType}
                      onChange={(e) => setSponsor((s) => ({ ...s, interestType: e.target.value }))}
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-white/80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    >
                      <option value="">{metaLoading ? "Carico..." : "Seleziona (opzionale)"}</option>
                      {interestOptions.map((o) => (
                        <option key={o.id || o.name} value={o.name}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      value={sponsor.name}
                      onChange={(e) => setSponsor((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Referente *"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                    <input
                      value={sponsor.phone}
                      onChange={(e) => setSponsor((s) => ({ ...s, phone: e.target.value }))}
                      placeholder="Telefono (opzionale)"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </div>

                  <input
                    value={sponsor.email}
                    onChange={(e) => setSponsor((s) => ({ ...s, email: e.target.value }))}
                    placeholder="Email *"
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />

                  <input
                    value={sponsor.budget}
                    onChange={(e) => setSponsor((s) => ({ ...s, budget: e.target.value }))}
                    placeholder="Budget indicativo (opzionale)"
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />

                  <textarea
                    value={sponsor.note}
                    onChange={(e) => setSponsor((s) => ({ ...s, note: e.target.value }))}
                    placeholder="Note / obiettivi / idee (opzionale)"
                    rows={5}
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
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
        </div>
      </section>

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
