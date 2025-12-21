"use client";

import React, { useMemo, useState } from "react";

/**
 * LedVelvet – Demo Navigabile (Cercle Moment mockup)
 * UI cues: full‑bleed imagery, minimal nav, lots of whitespace, editorial typography, soft borders.
 * Functionality kept: membership levels, KYC modal, tessera QR modal, shop w/ sizes+stock,
 * member discounts, shipping rules, cart drawer.
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
  // Palette ispirata ai visual social (nero profondo + accento rosso “velvet”)
  const palette = {
    sand: "#F7F5F1",
    ink: "#0B0B0C",
    accent: "#E11D48",
  } as const;
  const [user, setUser] = useState<{ email: string | null; level?: Level; kyc?: boolean }>({ email: null });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showKyc, setShowKyc] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [showCart, setShowCart] = useState(false);
  const [cartTimerMin, setCartTimerMin] = useState(10);

  // Video: in produzione (e su Vercel) i file dentro /public sono serviti da root.
  // Quindi /public/media/petra_led.mp4 diventa: /media/petra_led.mp4

  const products: Product[] = [
    {
      sku: "LV-TEE-BLK",
      name: "LedVelvet Tee – Black",
      price: 34,
      sizes: ["S", "M", "L", "XL"],
      stock: { S: 12, M: 20, L: 14, XL: 8 },
      image: "/shop/tee.png",
    },
    {
      sku: "LV-HAT",
      name: "LedVelvet Cap",
      price: 29,
      sizes: ["UNI"],
      stock: { UNI: 30 },
      image: "/shop/cap.png",
    },
    {
      sku: "LV-SCARF",
      name: "LedVelvet Scarf",
      price: 49,
      sizes: ["UNI"],
      stock: { UNI: 15 },
      image: "/shop/scarf.png",
    },
  ];

  const brand = {
    logo: "/logo.svg",
    hero: "/og.jpg",
    heroVideoMp4: "/media/petra_led.mp4",
    heroVideoWebm: "https://upload.wikimedia.org/wikipedia/commons/2/29/Wikimania_beach_party_2.webm",
  };

  // Se vuoi video diversi per evento, in produzione si mettono URL MP4 per ogni evento.
  const events = [
    {
      id: "evt1",
      name: "CRYPTA – Ethereal Clubbing",
      city: "Milano",
      date: "25 Gen 2026",
      href: "#",
      tag: "LISTE & TICKETS",
      videoSrc: null as any,
      posterSrc: "/og.jpg",
    },
    {
      id: "evt2",
      name: "HANGAR – Secret Night",
      city: "Toscana",
      date: "10 Feb 2026",
      href: "#",
      tag: "LIMITED",
      videoSrc: null as any,
      posterSrc: "/og.jpg",
    },
  ];

  // Nota: niente upload video in demo (pulito per cliente).

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
      className="min-h-screen bg-[var(--sand)] text-[var(--ink)]"
      style={{
        ["--sand" as any]: palette.sand,
        ["--ink" as any]: palette.ink,
        ["--accent" as any]: palette.accent,
      }}
    >
      {/* Top utility (Cercle-like cart timer) */}
      <div className="sticky top-0 z-50 border-b border-black/10 bg-[#F7F5F1]">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between text-xs tracking-wide">
          <div className="flex items-center gap-2">
            <span className="uppercase">Cart reserved for</span>
            <span className="font-medium">·</span>
            <button
              className="underline underline-offset-4"
              onClick={() => setCartTimerMin((m) => (m >= 30 ? 10 : m + 5))}
              title="Demo: incrementa timer"
            >
              Add time
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="uppercase">{tierLabel}</span>
            <button className="px-3 py-1 rounded-full border border-black/20 hover:bg-[var(--ink)] hover:text-white" onClick={() => setShowCart(true)}>
              Cart ({formatEUR(total)})
            </button>
          </div>
        </div>
      </div>

      {/* NAV */}
      <header className="sticky top-8 z-40 bg-[#F7F5F1]/90 backdrop-blur border-b border-black/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <img src={brand.logo} alt="LedVelvet" className="w-8 h-8 rounded-full border border-black/20 object-cover" />
            <span className="text-sm tracking-[0.25em] uppercase">LedVelvet</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-xs tracking-[0.22em] uppercase">
            <a href="#home" className="hover:opacity-70">Home</a>
            <a href="#eventi" className="hover:opacity-70">Momenti</a>
            <a href="#membership" className="hover:opacity-70">Membership</a>
            <a href="#shop" className="hover:opacity-70">Shop</a>
            <a href="#community" className="hover:opacity-70">Community</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user.email ? (
              <button
                onClick={() => setUser({ email: "demo@ledvelvet.it", level: "BASE" })}
                className="px-4 py-2 rounded-full border border-black/25 hover:bg-[var(--ink)] hover:text-white text-xs tracking-[0.18em] uppercase"
              >
                Accedi (demo)
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="bg-transparent rounded-full px-3 py-2 text-xs tracking-[0.18em] uppercase border border-black/25"
                  value={user.level || "BASE"}
                  onChange={(e) => setUser((u) => ({ ...u, level: e.target.value as Level }))}
                >
                  <option value="BASE">BASE</option>
                  <option value="VIP">VIP</option>
                  <option value="FOUNDER">FOUNDER</option>
                </select>
                <button
                  onClick={() => setUser({ email: null })}
                  className="px-4 py-2 rounded-full border border-black/25 hover:bg-[var(--ink)] hover:text-white text-xs tracking-[0.18em] uppercase"
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
          <div className="relative overflow-hidden rounded-[28px] border border-black/10 bg-white">
            <div className="relative aspect-[16/7] w-full bg-black">
              {/* Video hero in loop (stile Moment) */}
              <video
                className="absolute inset-0 z-10 h-full w-full object-cover"
                poster={brand.hero}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
              >
                <source src={brand.heroVideoMp4} type="video/mp4" />
                <source src={brand.heroVideoWebm} type="video/webm" />
              </video>
              {/* Poster fallback (sotto al video) */}
              <img
                src={brand.hero}
                alt="LedVelvet"
                className="absolute inset-0 z-0 h-full w-full object-cover"
                loading="eager"
              />
              {/* Overlay per leggibilità testi */}
              <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
            </div>
            <div className="absolute inset-0 z-30 flex items-end text-white">
              <div className="w-full p-6 md:p-10">
                <div className="flex flex-col gap-3 max-w-3xl rounded-[24px] bg-black/45 backdrop-blur-sm border border-white/10 p-6 md:p-7">
                  <div className="text-xs tracking-[0.22em] uppercase opacity-80">Ethereal clubbing in unconventional places</div>
                  <h1 className="text-4xl md:text-6xl leading-[0.95] font-semibold tracking-tight drop-shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
                    A Night You Don’t Repeat.
                    <span className="block opacity-80">You Remember.</span>
                  </h1>
                  <p className="max-w-2xl text-sm md:text-base opacity-80">
                    Iscriviti alla membership APS, accedi alle pre‑sale e sblocca sconti merch. Ticketing eventi via piattaforme esterne (Xceed/Shotgun) con CRM unificato sul sito.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <a href="#eventi" className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)]">Discover moments</a>
                    <a href="#membership" className="px-5 py-3 rounded-full border border-black/25 text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)] hover:text-white">Join membership</a>
                    <a href="#shop" className="px-5 py-3 rounded-full border border-black/25 text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)] hover:text-white">Shop the drop</a>
                  </div>
                </div>
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
              <div key={x.t} className="rounded-[22px] border border-black/10 bg-white p-6">
                <div className="text-xs tracking-[0.22em] uppercase opacity-80">{x.t}</div>
                <div className="mt-2 text-sm opacity-80">{x.d}</div>
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
              <div className="text-xs tracking-[0.22em] uppercase opacity-80">Choose your moment</div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Prossimi Eventi</h2>
            </div>
            <div className="text-xs tracking-[0.22em] uppercase opacity-60">tickets via Xceed / Shotgun</div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {events.map((e) => (
              <article key={e.id} className="rounded-[28px] border border-black/10 bg-white overflow-hidden">
                <div className="relative aspect-[16/9] bg-black">
                  {/* Video loop per evento (stile Moment) */}
                  <video
                    className="absolute inset-0 z-10 h-full w-full object-cover"
                    poster={e.posterSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                  >
                    <source src={brand.heroVideoMp4} type="video/mp4" />
                    <source src={brand.heroVideoWebm} type="video/webm" />
                  </video>
                  {/* Poster fallback */}
                  <img
                    src={e.posterSrc}
                    alt={e.name}
                    className="absolute inset-0 z-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs tracking-[0.22em] uppercase opacity-70">{e.tag}</div>
                    <a href={e.href} className="px-4 py-2 rounded-full border border-black/25 text-xs tracking-[0.18em] uppercase hover:bg-black hover:text-white">Book</a>
                  </div>
                  <h3 className="text-xl font-semibold mt-3">{e.name}</h3>
                  <div className="mt-2 text-sm opacity-75">{e.city} • {e.date}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* MEMBERSHIP */}
      <section id="membership" className="py-16 border-y border-black/10 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="max-w-2xl">
            <div className="text-xs tracking-[0.22em] uppercase opacity-80">What is a membership?</div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Membership APS</h2>
            <p className="mt-4 opacity-80">Onboarding con verifica documento (KYC light), tessera digitale con QR e benefici per livello.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {([
              { code: "BASE" as const, price: 39, perks: ["Tessera digitale", "Pre‑sale 15'", "Sconto Shop 5%"] },
              { code: "VIP" as const, price: 99, perks: ["Priority list", "Pre‑sale 60'", "Sconto Shop 10%", "Eventi solo soci"] },
              { code: "FOUNDER" as const, price: 199, perks: ["Badge Founder", "Inviti speciali", "Sconto Shop 15%", "Meet & Greet"] },
            ]).map((m) => (
              <div key={m.code} className="rounded-[28px] border border-black/10 bg-[#F7F5F1] p-6 flex flex-col">
                <div className="flex items-baseline justify-between">
                  <div className="text-xs tracking-[0.22em] uppercase opacity-70">{m.code}</div>
                  <div className="text-lg font-semibold">{formatEUR(m.price)}/anno</div>
                </div>
                <ul className="mt-4 space-y-2 text-sm opacity-90">
                  {m.perks.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-black/70" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button onClick={() => setShowKyc(true)} className="px-4 py-2 rounded-full border border-black/25 text-xs tracking-[0.18em] uppercase hover:bg-black hover:text-white">KYC</button>
                  <button onClick={() => alert(`Checkout membership ${m.code} (demo)`)} className="px-4 py-2 rounded-full bg-black text-white text-xs tracking-[0.18em] uppercase">Join</button>
                </div>
              </div>
            ))}
          </div>

          {showKyc && (
            <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => setShowKyc(false)}>
              <div className="w-full max-w-lg rounded-[28px] bg-white border border-black/10 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase opacity-70">KYC</div>
                    <h4 className="text-xl font-semibold mt-1">Dati Socio</h4>
                  </div>
                  <button className="px-3 py-1 rounded-full border border-black/20 text-xs" onClick={() => setShowKyc(false)}>Chiudi</button>
                </div>
                <div className="grid gap-3 mt-5">
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Nome" className="px-4 py-3 rounded-2xl bg-[#F7F5F1] border border-black/10" />
                    <input placeholder="Cognome" className="px-4 py-3 rounded-2xl bg-[#F7F5F1] border border-black/10" />
                  </div>
                  <input placeholder="Codice Fiscale" className="px-4 py-3 rounded-2xl bg-[#F7F5F1] border border-black/10" />
                  <input type="date" className="px-4 py-3 rounded-2xl bg-[#F7F5F1] border border-black/10" />
                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="px-4 py-3 rounded-2xl bg-[#F7F5F1] border border-black/10 text-sm opacity-80">
                      Documento fronte
                      <input type="file" className="block mt-2 text-sm" />
                    </label>
                    <label className="px-4 py-3 rounded-2xl bg-[#F7F5F1] border border-black/10 text-sm opacity-80">
                      Documento retro
                      <input type="file" className="block mt-2 text-sm" />
                    </label>
                  </div>
                  <label className="text-sm opacity-80 flex items-center gap-2"><input type="checkbox" /> Consenso privacy/GDPR</label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button className="px-5 py-3 rounded-full border border-black/25 text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)] hover:text-white" onClick={() => setShowKyc(false)}>Annulla</button>
                  <button className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)]" onClick={() => { setUser((u) => ({ ...u, kyc: true, email: u.email ?? "demo@ledvelvet.it", level: u.level ?? "BASE" })); setShowKyc(false); }}>Invia</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SHOP */}
      <section id="shop" className="py-16 border-y border-black/10 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs tracking-[0.22em] uppercase opacity-80">Merchandise</div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Shop</h2>
              <p className="mt-3 opacity-75 text-sm">Sconti soci: BASE 5% • VIP 10% • FOUNDER 15% — Spedizione {formatEUR(5)} (gratis oltre {formatEUR(60)}).</p>
            </div>
            <button className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)]" onClick={() => setShowCart(true)}>Checkout ({formatEUR(total)})</button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {products.map((p) => (
              <div key={p.sku} className="rounded-[28px] border border-black/10 bg-[#F7F5F1] overflow-hidden">
                <div className="aspect-square overflow-hidden bg-black">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs tracking-[0.22em] uppercase opacity-70">{p.sku}</div>
                      <div className="text-lg font-semibold mt-1">{p.name}</div>
                    </div>
                    <div className="text-sm font-medium">{formatEUR(p.price)}</div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs tracking-[0.22em] uppercase opacity-70">Size</div>
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
                              active ? "bg-black text-white border-black" : "border-black/25 hover:bg-black hover:text-white",
                              !inStock && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-inherit"
                            )}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs opacity-70">Stock: {p.stock?.[(selectedSize[p.sku] || p.sizes[0]) as any] ?? "–"}</div>
                  </div>

                  <button onClick={() => addToCart(p)} className="mt-5 w-full px-5 py-3 rounded-full bg-black text-white text-xs tracking-[0.18em] uppercase">Add to cart</button>
                </div>
              </div>
            ))}
          </div>

          {/* CART DRAWER */}
          {showCart && (
            <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" onClick={() => setShowCart(false)}>
              <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-black/10 p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs tracking-[0.22em] uppercase opacity-70">Cart</div>
                    <h3 className="text-2xl font-semibold mt-1">Il tuo carrello</h3>
                    <div className="mt-2 text-xs opacity-70">Reservation time: {cartTimerMin} min (demo)</div>
                  </div>
                  <button className="px-4 py-2 rounded-full border border-black/25 text-xs tracking-[0.18em] uppercase hover:bg-black hover:text-white" onClick={() => setShowCart(false)}>Chiudi</button>
                </div>

                <div className="mt-6 space-y-3">
                  {cart.length === 0 && <p className="text-sm opacity-70">Il carrello è vuoto.</p>}
                  {cart.map((i, idx) => (
                    <div key={`${i.sku}-${i.size}-${idx}`} className="rounded-[22px] border border-black/10 bg-[#F7F5F1] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{i.name} {i.size ? `(${i.size})` : ""}</div>
                          <div className="text-xs opacity-70 mt-1">{formatEUR(i.price)} cad.</div>
                        </div>
                        <button className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100" onClick={() => removeFromCart(idx)}>Rimuovi</button>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button className="w-9 h-9 rounded-full border border-black/25 hover:bg-black hover:text-white" onClick={() => decQty(idx)}>-</button>
                          <div className="w-10 text-center text-sm">{i.qty}</div>
                          <button className="w-9 h-9 rounded-full border border-black/25 hover:bg-black hover:text-white" onClick={() => incQty(idx)}>+</button>
                        </div>
                        <div className="text-sm font-medium">{formatEUR(i.qty * i.price)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[28px] border border-black/10 bg-[#F7F5F1] p-5 text-sm space-y-2">
                  <div className="flex items-center justify-between"><span>Subtotale</span><span>{formatEUR(subtotal)}</span></div>
                  <div className="flex items-center justify-between"><span>Sconto soci {Math.round(discountRate * 100)}%</span><span>-{formatEUR(discount)}</span></div>
                  <div className="flex items-center justify-between"><span>Spedizione</span><span>{formatEUR(shipping)}</span></div>
                  <div className="flex items-center justify-between text-base font-semibold"><span>Totale</span><span>{formatEUR(total)}</span></div>
                  <button className="w-full mt-3 px-5 py-3 rounded-full bg-black text-white text-xs tracking-[0.18em] uppercase" onClick={() => alert(`Redirect a Stripe Checkout (demo) – Totale ${formatEUR(total)}`)}>Procedi al pagamento</button>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>

      {/* COMMUNITY */}
      <section id="community" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="rounded-[28px] border border-black/10 bg-white p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase opacity-80">Be part of the circle</div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Community LedVelvet</h2>
                <p className="mt-4 opacity-80">Newsletter (no spam): pre‑sale, drop merch, location reveal e inviti.</p>
              </div>
              <div className="rounded-[22px] border border-black/10 bg-[#F7F5F1] p-5">
                <div className="text-xs tracking-[0.22em] uppercase opacity-70">Subscribe</div>
                <div className="mt-3 grid gap-3">
                  <input placeholder="Email" className="px-4 py-3 rounded-2xl bg-white border border-black/10" />
                  <button className="px-5 py-3 rounded-full bg-[var(--accent)] text-white text-xs tracking-[0.18em] uppercase hover:bg-[var(--ink)]" onClick={() => alert("Iscrizione newsletter (demo)")}>Join</button>
                  <div className="text-xs opacity-70">Puoi disiscriverti in qualsiasi momento.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-black/10 py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs tracking-[0.22em] uppercase opacity-70">© {new Date().getFullYear()} LedVelvet APS • Privacy • Cookie • Termini</p>
          <div className="flex gap-4 text-xs tracking-[0.22em] uppercase">
            <a className="hover:opacity-70" href="#">Instagram</a>
            <a className="hover:opacity-70" href="#">TikTok</a>
            <a className="hover:opacity-70" href="#">Press Kit</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
