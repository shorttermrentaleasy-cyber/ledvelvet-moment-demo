"use client";

import React, { useMemo, useRef, useState } from "react";

/**
 * LedVelvet – Demo Navigabile (Cercle Moment mockup) – DARK EDITION
 * Mobile fixes:
 * - overlay non blocca i tap (pointer-events-none)
 * - audio toggle iOS-safe (muted=false + play() nello stesso tap)
 * - fullscreen iOS-safe (webkitEnterFullscreen) + fallback requestFullscreen
 * + Sponsor area (form + CTA + anchor in menu)
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

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatEUR(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function LedVelvetCercleMockup() {
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

  const [user, setUser] = useState<{ email: string | null; level?: Level; kyc?: boolean }>({ email: null });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showKyc, setShowKyc] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [showCart, setShowCart] = useState(false);
  const [cartTimerMin, setCartTimerMin] = useState(10);

  // VIDEO / AUDIO
  const [muted, setMuted] = useState(true);
  const [tapHint, setTapHint] = useState<string | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  // SPONSOR form (client-side only, mailto)
  const sponsorEmail = "sponsor@ledvelvet.com";
  const [sponsor, setSponsor] = useState({
    brand: "",
    name: "",
    email: "",
    phone: "",
    budget: "",
    note: "",
  });

  const isIOS = () => {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  };

  async function toggleMute() {
    const v = heroVideoRef.current;
    if (!v) return;

    // IMPORTANT: su iOS per attivare l’audio bisogna farlo dentro il tap:
    // 1) set muted=false
    // 2) play()
    const nextMuted = !muted;

    setMuted(nextMuted);
    v.muted = nextMuted;

    try {
      if (!nextMuted) {
        v.volume = 1;
        await v.play();
        setTapHint(null);
      } else {
        setTapHint(null);
      }
    } catch {
      setTapHint(isIOS() ? "Su iPhone: se l’audio non parte, riprova a toccare Audio." : "Audio bloccato dal browser: riprova.");
      setMuted(true);
      v.muted = true;
    }
  }

  function requestHeroFullscreen() {
    const v = heroVideoRef.current as any;
    if (!v) return;

    try {
      // iOS Safari: fullscreen “vero” solo così
      if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
        return;
      }

      // standard fullscreen (desktop + molti Android)
      const el: any = v;
      const fn =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen ||
        null;

      fn?.call(el);
    } catch {
      // ignore
    }
  }

  function openSponsorMail() {
    const subject = encodeURIComponent("LedVelvet – Richiesta Sponsorship");
    const body = encodeURIComponent(
      [
        `Brand/Azienda: ${sponsor.brand || "-"}`,
        `Referente: ${sponsor.name || "-"}`,
        `Email: ${sponsor.email || "-"}`,
        `Telefono: ${sponsor.phone || "-"}`,
        `Budget indicativo: ${sponsor.budget || "-"}`,
        "",
        "Messaggio:",
        sponsor.note || "-",
        "",
        "Inviato dal sito LedVelvet (/moment).",
      ].join("\n")
    );

    // Mail client
    window.location.href = `mailto:${sponsorEmail}?subject=${subject}&body=${body}`;
  }

  const products: Product[] = [
    { sku: "LV-TEE-BLK", name: "LedVelvet Tee – Black", price: 34, sizes: ["S", "M", "L", "XL"], stock: { S: 12, M: 20, L: 14, XL: 8 }, image: "/shop/tee.png" },
    { sku: "LV-HAT", name: "LedVelvet Cap", price: 29, sizes: ["UNI"], stock: { UNI: 30 }, image: "/shop/cap.png" },
    { sku: "LV-SCARF", name: "LedVelvet Scarf", price: 49, sizes: ["UNI"], stock: { UNI: 15 }, image: "/shop/scarf.png" },
  ];

  const brand = {
    logo: "/logo.png",
    hero: "/og.jpg",
    heroVideoMp4: "/media/petra_led.mp4",
    heroVideoWebm: "https://upload.wikimedia.org/wikipedia/commons/2/29/Wikimania_beach_party_2.webm",
  };

  const events = [
    { id: "evt1", name: "CRYPTA – Ethereal Clubbing", city: "Milano", date: "25 Gen 2026", href: "#", tag: "LISTE & TICKETS", videoSrc: null as any, posterSrc: "/og.jpg" },
    { id: "evt2", name: "HANGAR – Secret Night", city: "Toscana", date: "10 Feb 2026", href: "#", tag: "LIMITED", videoSrc: null as any, posterSrc: "/og.jpg" },
  ];

  // Sponsor “logo wall” demo (metti i tuoi asset in /public/sponsors/*)
  const sponsorWall = [
    { name: "Red Bull (demo)", role: "Energy Partner", src: "/sponsors/sponsor1.png" },
    { name: "Jägermeister (demo)", role: "Night Partner", src: "/sponsors/sponsor2.png" },
    { name: "Local Club (demo)", role: "Venue Partner", src: "/sponsors/sponsor3.png" },
    { name: "Fashion Label (demo)", role: "Style Partner", src: "/sponsors/sponsor4.png" },
  ];

  const { subtotal, discountRate, discount, shipping, total } = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const level = user.level || (user.email ? "BASE" : undefined);
    const discountRate = level === "FOUNDER" ? 0.15 : level === "VIP" ? 0.1 : level === "BASE" ? 0.05 : 0;
    const discount = Math.round(subtotal * discountRate * 100) / 100;
    const shipping = subtotal - discount > 0 && subtotal - discount < 60 ? 5 : 0;
    const total = Math.max(0, Math.round(((subtotal - discount) + shipping) * 100) / 100);
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
      {/* Soft neon ambience */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(900px circle at 15% 10%, rgba(225,29,72,0.22), transparent 55%), radial-gradient(700px circle at 85% 15%, rgba(255,46,99,0.16), transparent 52%), radial-gradient(900px circle at 50% 90%, rgba(225,29,72,0.10), transparent 55%)",
        }}
      />

      {/* Top utility */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[var(--surface)]/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between text-xs tracking-wide">
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <span className="uppercase">Cart reserved for</span>
            <span className="font-medium">·</span>
            <button
              className="underline underline-offset-4 hover:text-[var(--text)]"
              onClick={() => setCartTimerMin((m) => (m >= 30 ? 10 : m + 5))}
              title="Demo: incrementa timer"
            >
              Add time
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="uppercase text-[var(--muted)]">{tierLabel}</span>
            <button
              className="px-3 py-1 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10"
              onClick={() => setShowCart(true)}
            >
              Cart ({formatEUR(total)})
            </button>
          </div>
        </div>
      </div>

      {/* NAV */}
      <header className="sticky top-8 z-40 bg-[var(--surface)]/60 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <img src={brand.logo} alt="LedVelvet" className="w-8 h-8 rounded-full border border-white/15 object-cover" />
            <span className="text-sm tracking-[0.25em] uppercase">LedVelvet</span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
            <a href="#home" className="hover:text-[var(--text)]">Home</a>
            <a href="#eventi" className="hover:text-[var(--text)]">Momenti</a>
            <a href="#membership" className="hover:text-[var(--text)]">Membership</a>
            <a href="#shop" className="hover:text-[var(--text)]">Shop</a>
            <a href="#sponsor" className="hover:text-[var(--text)]">Sponsor</a>
            <a href="#community" className="hover:text-[var(--text)]">Community</a>
          </nav>

          <div className="flex items-center gap-2">
            {!user.email ? (
              <button
                onClick={() => setUser({ email: "demo@ledvelvet.it", level: "BASE" })}
                className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
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
                poster={brand.hero}
                autoPlay
                loop
                muted={muted}
                playsInline
                preload="metadata"
              >
                <source src={brand.heroVideoMp4} type="video/mp4" />
                <source src={brand.heroVideoWebm} type="video/webm" />
              </video>

              <img src={brand.hero} alt="LedVelvet" className="absolute inset-0 z-0 h-full w-full object-cover" loading="eager" />

              {/* Overlay (NON blocca tap) */}
              <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-t from-black/95 via-black/55 to-black/15" />
              <div
                className="absolute inset-0 z-20 pointer-events-none opacity-60"
                style={{ background: "radial-gradient(800px circle at 20% 60%, rgba(225,29,72,0.18), transparent 60%)" }}
              />

              {/* Controls */}
              <div className="absolute right-3 top-3 z-40 flex flex-col gap-2 pointer-events-auto">
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

                {tapHint && (
                  <div
                    className="mt-1 max-w-[210px] rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[10px] leading-snug text-white/80"
                    style={{ backdropFilter: "blur(10px)" as any }}
                  >
                    {tapHint}
                  </div>
                )}
              </div>
            </div>

            {/* Content layer */}
            <div className="absolute inset-0 z-30 flex items-end text-white pointer-events-none">
              <div className="w-full p-4 sm:p-6 md:p-10">
                <div className="flex flex-col gap-3 max-w-3xl rounded-[24px] bg-black/55 backdrop-blur-md border border-white/10 p-4 sm:p-6 md:p-7 pointer-events-auto">
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

                    <a
                      href="#sponsor"
                      className="w-full sm:w-auto px-5 py-3 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30 text-center"
                    >
                      Become a sponsor
                    </a>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Feature bullets */}
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

      {/* EVENTI / MOMENTI */}
      <section id="eventi" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs tracking-[0.22em] uppercase text-white/70">Choose your moment</div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Prossimi Eventi</h2>
            </div>
            <div className="text-xs tracking-[0.22em] uppercase text-white/50">tickets via Xceed / Shotgun</div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {events.map((e) => (
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
                    <source src={brand.heroVideoMp4} type="video/mp4" />
                    <source src={brand.heroVideoWebm} type="video/webm" />
                  </video>

                  <img src={e.posterSrc} alt={e.name} className="absolute inset-0 z-0 h-full w-full object-cover" loading="lazy" />

                  <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                  <div
                    className="absolute inset-0 z-20 pointer-events-none opacity-70"
                    style={{ background: "radial-gradient(700px circle at 20% 80%, rgba(225,29,72,0.14), transparent 60%)" }}
                  />
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs tracking-[0.22em] uppercase text-white/60">{e.tag}</div>

                    <a
                      href={e.href}
                      className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)] hover:border-[var(--accent)]"
                      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset" }}
                    >
                      Book
                    </a>
                  </div>

                  <h3 className="text-xl font-semibold mt-3">{e.name}</h3>
                  <div className="mt-2 text-sm text-white/65">
                    {e.city} • {e.date}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* MEMBERSHIP */}
      <section id="membership" className="py-16 border-y border-white/10 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.22em] uppercase text-white/70">What is a membership?</div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Membership APS</h2>
            <p className="mt-4 text-white/70">Onboarding con verifica documento (KYC light), tessera digitale con QR e benefici per livello.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {[
              { code: "BASE" as const, price: 39, perks: ["Tessera digitale", "Pre-sale 15'", "Sconto Shop 5%"] },
              { code: "VIP" as const, price: 99, perks: ["Priority list", "Pre-sale 60'", "Sconto Shop 10%", "Eventi solo soci"] },
              { code: "FOUNDER" as const, price: 199, perks: ["Badge Founder", "Inviti speciali", "Sconto Shop 15%", "Meet & Greet"] },
            ].map((m) => (
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
                  >
                    KYC
                  </button>

                  <button
                    onClick={() => alert(`Checkout membership ${m.code} (demo)`)}
                    className="px-4 py-2 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                    style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
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
                  <button className="px-3 py-1 rounded-full border border-white/15 text-xs hover:bg-white/10" onClick={() => setShowKyc(false)}>
                    Chiudi
                  </button>
                </div>

                <div className="grid gap-3 mt-5">
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      placeholder="Nome"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                    <input
                      placeholder="Cognome"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />
                  </div>

                  <input
                    placeholder="Codice Fiscale"
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />

                  <input
                    type="date"
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-white/80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />

                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white/70">
                      Documento fronte
                      <input type="file" className="block mt-2 text-sm text-white/70" />
                    </label>
                    <label className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white/70">
                      Documento retro
                      <input type="file" className="block mt-2 text-sm text-white/70" />
                    </label>
                  </div>

                  <label className="text-sm text-white/70 flex items-center gap-2">
                    <input type="checkbox" /> Consenso privacy/GDPR
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    className="px-5 py-3 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30"
                    onClick={() => setShowKyc(false)}
                  >
                    Annulla
                  </button>

                  <button
                    className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                    onClick={() => {
                      setUser((u) => ({ ...u, kyc: true, email: u.email ?? "demo@ledvelvet.it", level: u.level ?? "BASE" }));
                      setShowKyc(false);
                    }}
                    style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.22)" }}
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
            >
              Checkout ({formatEUR(total)})
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {products.map((p) => (
              <div key={p.sku} className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
                <div className="relative aspect-square overflow-hidden bg-black">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15 pointer-events-none" />
                  <div
                    className="absolute left-4 top-4 px-3 py-1 rounded-full text-[10px] tracking-[0.22em] uppercase border border-white/15 bg-black/40 text-white/80"
                    style={{ backdropFilter: "blur(8px)" as any }}
                  >
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
                              active
                                ? "bg-white/10 text-white border-white/25"
                                : "border-white/15 text-white/80 hover:bg-white/10 hover:border-white/30",
                              !inStock && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-inherit"
                            )}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs text-white/55">
                      Stock: {p.stock?.[(selectedSize[p.sku] || p.sizes[0]) as any] ?? "–"}
                    </div>
                  </div>

                  <button
                    onClick={() => addToCart(p)}
                    className="mt-5 w-full px-5 py-3 rounded-full bg-white/10 text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent)]"
                    style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset" }}
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
                  <button className="px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10" onClick={() => setShowCart(false)}>
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
                        <button className="text-xs underline underline-offset-4 text-white/60 hover:text-white" onClick={() => removeFromCart(idx)}>
                          Rimuovi
                        </button>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button className="w-9 h-9 rounded-full border border-white/15 hover:bg-white/10" onClick={() => decQty(idx)}>
                            -
                          </button>
                          <div className="w-10 text-center text-sm">{i.qty}</div>
                          <button className="w-9 h-9 rounded-full border border-white/15 hover:bg-white/10" onClick={() => incQty(idx)}>
                            +
                          </button>
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
          <div className="rounded-[28px] border border-white/10 bg-[var(--surface2)] overflow-hidden">
            <div className="p-8 md:p-10">
              <div className="grid md:grid-cols-2 gap-10 items-start">
                <div>
                  <div className="text-xs tracking-[0.22em] uppercase text-white/70">Partnership</div>
                  <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Sponsor & Brand Activation</h2>
                  <p className="mt-4 text-white/70">
                    LedVelvet è un format giovane: esperienze, musica e visual. Se vuoi diventare sponsor, trovi qui una richiesta rapida.
                    Ti rispondiamo via email con media kit e pacchetti.
                  </p>

                  <div className="mt-6 grid sm:grid-cols-2 gap-4">
                    {[
                      { t: "Brand visibility", d: "Logo wall, credits e contenuti social dedicati." },
                      { t: "On-site activation", d: "Corner esperienziali, sampling e photo moment." },
                      { t: "Content package", d: "Reels, stories e recap dell’evento." },
                      { t: "Community reach", d: "Newsletter e audience profilata." },
                    ].map((x) => (
                      <div key={x.t} className="rounded-[22px] border border-white/10 bg-black/25 p-5">
                        <div className="text-xs tracking-[0.22em] uppercase text-white/80">{x.t}</div>
                        <div className="mt-2 text-sm text-white/70">{x.d}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 flex flex-wrap gap-2">
                    <a
                      href={`mailto:${sponsorEmail}?subject=${encodeURIComponent("LedVelvet – Sponsorship")}`}
                      className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                      style={{ boxShadow: "0 12px 38px rgba(225,29,72,0.22)" }}
                    >
                      Scrivi a {sponsorEmail}
                    </a>

                    <a
                      href="#community"
                      className="px-5 py-3 rounded-full border border-white/15 text-xs tracking-[0.18em] uppercase hover:bg-white/10 hover:border-white/30"
                    >
                      Join the community
                    </a>
                  </div>

                  {/* Sponsor wall demo */}
                  <div className="mt-10">
                    <div className="text-xs tracking-[0.22em] uppercase text-white/60">Current sponsors (demo)</div>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {sponsorWall.map((s) => (
                        <div key={s.name} className="rounded-[18px] border border-white/10 bg-black/25 p-3 flex flex-col items-center text-center">
                          <div className="w-full aspect-[4/3] rounded-2xl bg-black/30 border border-white/10 overflow-hidden grid place-items-center">
                            {/* Se non hai ancora i file, resterà un box “vuoto” ma bello */}
                            <img
                              src={s.src}
                              alt={s.name}
                              className="w-full h-full object-contain p-2 opacity-90"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                            <div className="text-[10px] text-white/45 px-2">logo</div>
                          </div>
                          <div className="mt-2 text-[10px] tracking-[0.22em] uppercase text-white/70">{s.role}</div>
                          <div className="mt-1 text-xs text-white/85 font-medium">{s.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div className="rounded-[26px] border border-white/10 bg-black/25 p-6 md:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs tracking-[0.22em] uppercase text-white/60">Sponsor request</div>
                      <h3 className="text-xl font-semibold mt-1">Richiedi info</h3>
                      <p className="mt-2 text-sm text-white/70">
                        Compila 30 secondi. Si aprirà la tua mail con i dati già pronti.
                      </p>
                    </div>
                    <div
                      className="px-3 py-1 rounded-full text-[10px] tracking-[0.22em] uppercase border border-white/15 bg-black/30 text-white/70"
                      style={{ backdropFilter: "blur(10px)" as any }}
                    >
                      demo
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <input
                      value={sponsor.brand}
                      onChange={(e) => setSponsor((p) => ({ ...p, brand: e.target.value }))}
                      placeholder="Brand / Azienda"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />

                    <div className="grid md:grid-cols-2 gap-3">
                      <input
                        value={sponsor.name}
                        onChange={(e) => setSponsor((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Referente"
                        className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                      />
                      <input
                        value={sponsor.phone}
                        onChange={(e) => setSponsor((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Telefono (opzionale)"
                        className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                      />
                    </div>

                    <input
                      value={sponsor.email}
                      onChange={(e) => setSponsor((p) => ({ ...p, email: e.target.value }))}
                      placeholder="Email"
                      inputMode="email"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />

                    <input
                      value={sponsor.budget}
                      onChange={(e) => setSponsor((p) => ({ ...p, budget: e.target.value }))}
                      placeholder="Budget indicativo (es: 1.000€ – 5.000€)"
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                    />

                    <textarea
                      value={sponsor.note}
                      onChange={(e) => setSponsor((p) => ({ ...p, note: e.target.value }))}
                      placeholder="Che tipo di partnership cerchi? (logo, stand, sampling, contenuti, ecc.)"
                      rows={5}
                      className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
                    />

                    <button
                      type="button"
                      onClick={openSponsorMail}
                      className="mt-1 w-full px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                      style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                    >
                      Invia richiesta (email)
                    </button>

                    <div className="text-xs text-white/55">
                      Oppure scrivi direttamente:{" "}
                      <a className="underline underline-offset-4 hover:text-white" href={`mailto:${sponsorEmail}`}>
                        {sponsorEmail}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* thin glow bottom */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        </div>
      </section>

      {/* COMMUNITY */}
      <section id="community" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="rounded-[28px] border border-white/10 bg-[var(--surface2)] p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-white/70">Be part of the circle</div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Community LedVelvet</h2>
                <p className="mt-4 text-white/70">Newsletter (no spam): pre-sale, drop merch, location reveal e inviti.</p>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/25 p-5">
                <div className="text-xs tracking-[0.22em] uppercase text-white/60">Subscribe</div>
                <div className="mt-3 grid gap-3">
                  <input
                    placeholder="Email"
                    className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />
                  <button
                    className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--accent2)]"
                    onClick={() => alert("Iscrizione newsletter (demo)")}
                    style={{ boxShadow: "0 10px 30px rgba(225,29,72,0.20)" }}
                  >
                    Join
                  </button>
                  <div className="text-xs text-white/55">Puoi disiscriverti in qualsiasi momento.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs tracking-[0.22em] uppercase text-white/60">© {new Date().getFullYear()} LedVelvet APS • Privacy • Cookie • Termini</p>
          <div className="flex gap-4 text-xs tracking-[0.22em] uppercase text-white/60">
            <a className="hover:text-white" href="#">Instagram</a>
            <a className="hover:text-white" href="#">TikTok</a>
            <a className="hover:text-white" href="#sponsor">Sponsor</a>
            <a className="hover:text-white" href="#">Press Kit</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
