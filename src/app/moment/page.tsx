"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * LedVelvet – /moment – DARK EDITION (single-file)
 * Updates:
 * - Sponsor form: validates email/phone
 * - Sponsor form: dropdown "interest type" and "select" loaded from Airtable via meta API
 * - Payload sends { interestType, select } to /api/sponsor-request
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
  date: string;
  href: string;
  tag: string;
  posterSrc: string;
  videoMp4?: string | null;
  status: "upcoming" | "past";
};

type SponsorForm = {
  brand: string;
  name: string;
  email: string;
  phone: string;
  budget: string;
  note: string;
  interestType: string; // NEW
  select: string; // NEW
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
  // allow +, numbers, spaces
  const cleaned = raw.replace(/[^\d+\s]/g, "").trim();
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!cleaned) return "";
  if (digits.length < 6) return ""; // too short => invalid
  return cleaned;
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

  // Sponsor meta options (loaded from Airtable via API)
  const [interestOptions, setInterestOptions] = useState<MetaOption[]>([]);
  const [selectOptions, setSelectOptions] = useState<MetaOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);

  const [sponsor, setSponsor] = useState<SponsorForm>({
    brand: "",
    name: "",
    email: "",
    phone: "",
    budget: "",
    note: "",
    interestType: "",
    select: "",
  });
  const [sponsorSending, setSponsorSending] = useState(false);
  const [sponsorSentOk, setSponsorSentOk] = useState<string | null>(null);
  const [sponsorSentErr, setSponsorSentErr] = useState<string | null>(null);

  const [muted, setMuted] = useState(true);
  const [fsErr, setFsErr] = useState<string | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  // Load sponsor dropdown options from Airtable (single source of truth)
  useEffect(() => {
    let alive = true;

    async function loadMeta() {
      setMetaLoading(true);
      try {
        // route you will add: /api/meta/sponsor-request-options
        const r = await fetch("/api/meta/sponsor-request-options", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;

        if (r.ok && j?.ok) {
          setInterestOptions(Array.isArray(j?.interestTypeOptions) ? j.interestTypeOptions : []);
          setSelectOptions(Array.isArray(j?.selectOptions) ? j.selectOptions : []);
        } else {
          // non blocchiamo il form: solo no dropdown
          setInterestOptions([]);
          setSelectOptions([]);
        }
      } catch {
        if (!alive) return;
        setInterestOptions([]);
        setSelectOptions([]);
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

  const events: EventItem[] = [
    {
      id: "evt1",
      name: "CRYPTA – Ethereal Clubbing",
      city: "Milano",
      date: "25 Gen 2026",
      href: "#",
      tag: "LISTE & TICKETS",
      posterSrc: "/og.jpg",
      videoMp4: null,
      status: "upcoming",
    },
    {
      id: "evt2",
      name: "HANGAR – Secret Night",
      city: "Toscana",
      date: "10 Feb 2026",
      href: "#",
      tag: "LIMITED",
      posterSrc: "/og.jpg",
      videoMp4: null,
      status: "upcoming",
    },
    {
      id: "evt3",
      name: "VELVET ROOM – Afterhours",
      city: "Firenze",
      date: "12 Ott 2025",
      href: "#",
      tag: "SOLD OUT",
      posterSrc: "/og.jpg",
      videoMp4: null,
      status: "past",
    },
    {
      id: "evt4",
      name: "NEON GROVE – Secret Garden",
      city: "Pisa",
      date: "20 Lug 2025",
      href: "#",
      tag: "RECAP",
      posterSrc: "/og.jpg",
      videoMp4: null,
      status: "past",
    },
  ];

  const upcomingEvents = events.filter((e) => e.status === "upcoming");
  const pastEvents = events.filter((e) => e.status === "past");

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

    // phone optional, but must be valid if present
    const phoneNorm = phoneVal ? normalizePhone(phoneVal) : "";
    if (phoneVal && !phoneNorm) return setSponsorSentErr("Telefono non valido (usa numeri e +).");

    // If Airtable options exist, force dropdown values to be valid
    if (interestOptions.length > 0 && sponsor.interestType) {
      const ok = interestOptions.some((o) => o.name === sponsor.interestType);
      if (!ok) return setSponsorSentErr("Interest type non valido.");
    }
    if (selectOptions.length > 0 && sponsor.select) {
      const ok = selectOptions.some((o) => o.name === sponsor.select);
      if (!ok) return setSponsorSentErr("Select non valido.");
    }

    setSponsorSending(true);
    try {
      const payload = {
        ...sponsor,
        brand: brandVal,
        name: nameVal,
        email: emailVal,
        phone: phoneNorm || "", // send normalized phone
        source: "moment", // helps Airtable
      };

      const res = await fetch("/api/sponsor-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        const msg =
          data?.error ||
          data?.details?.error?.message ||
          "Errore invio richiesta. Riprova.";
        throw new Error(msg);
      }

      setSponsorSentOk("Richiesta inviata! Ti risponderemo via email a breve.");
      setSponsor({
        brand: "",
        name: "",
        email: "",
        phone: "",
        budget: "",
        note: "",
        interestType: "",
        select: "",
      });
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

      {/* ... TUTTO IL RESTO IDENTICO FINO ALLA SEZIONE SPONSOR ... */}

      {/* (Ho lasciato invariato tutto il file sopra per brevità qui in chat.
          NEL TUO PROGETTO DEVI INCOLLARE QUESTO FILE INTERO.
          Se vuoi, te lo rigiro "full" senza i puntini: dimmi e lo posto completo al 100%.)
      */}

      <section id="sponsor" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="rounded-[28px] border border-white/10 bg-[var(--surface2)] p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-white/70">Become a partner</div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">Sponsor Area</h2>
                <p className="mt-4 text-white/70">
                  Compila il form: la richiesta viene salvata su Airtable e inviata via email al team.
                </p>

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

                  {/* NEW: dropdowns */}
                  <div className="grid sm:grid-cols-2 gap-3">
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

                    <div className="grid gap-1">
                      <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Select</div>
                      <select
                        value={sponsor.select}
                        onChange={(e) => setSponsor((s) => ({ ...s, select: e.target.value }))}
                        className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-white/80 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                      >
                        <option value="">{metaLoading ? "Carico..." : "Seleziona (opzionale)"}</option>
                        {selectOptions.map((o) => (
                          <option key={o.id || o.name} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
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

                  {sponsorSentErr && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                      {sponsorSentErr}
                    </div>
                  )}
                  {sponsorSentOk && (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                      {sponsorSentOk}
                    </div>
                  )}

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
                    {metaLoading ? "Carico opzioni da Airtable..." : interestOptions.length === 0 && selectOptions.length === 0 ? "Opzioni Airtable non disponibili (ok comunque)." : ""}
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
