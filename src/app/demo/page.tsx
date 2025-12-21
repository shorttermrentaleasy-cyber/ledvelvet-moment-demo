"use client";

import React, { useMemo, useState } from "react";

// LedVelvet – Demo Navigabile (rigenerata)
// - Shop con taglie/stock
// - Sconti soci: BASE 5%, VIP 10%, FOUNDER 15%
// - Spedizione: €5 (gratis > €60)
// - Carrello con riepilogo e rimozione
// - KYC/Tessera come prima (demo)

export default function LedVelvetLiveDemo() {
  const [user, setUser] = useState<{ email: string | null; level?: "BASE" | "VIP" | "FOUNDER"; kyc?: boolean }>({ email: null });
  const [cart, setCart] = useState<{ sku: string; name: string; qty: number; price: number; size?: string }[]>([]);
  const [showKyc, setShowKyc] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [showCart, setShowCart] = useState(false);

  const products = [
    { sku: "LV-TEE-BLK", name: "LedVelvet Tee – Black", price: 34, sizes: ["S","M","L","XL"], stock: { S: 12, M: 20, L: 14, XL: 8 } },
    { sku: "LV-HAT", name: "LedVelvet Cap", price: 29, sizes: ["UNI"], stock: { UNI: 30 } },
    { sku: "LV-HOODIE", name: "LedVelvet Hoodie", price: 69, sizes: ["S","M","L","XL"], stock: { S: 6, M: 10, L: 5, XL: 3 } },
  ] as const;

  const events = [
    { id: "evt1", name: "CRYPTA – Ethereal Clubbing", city: "Milano", date: "25 Gen 2026", href: "#" },
    { id: "evt2", name: "HANGAR – Secret Night", city: "Toscana", date: "10 Feb 2026", href: "#" },
  ];

  const { subtotal, discountRate, discount, shipping, total } = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const level = user.level || (user.email ? "BASE" : undefined);
    const discountRate = level === "FOUNDER" ? 0.15 : level === "VIP" ? 0.10 : level === "BASE" ? 0.05 : 0;
    const discount = Math.round((subtotal * discountRate) * 100) / 100;
    const shipping = subtotal - discount > 0 && subtotal - discount < 60 ? 5 : 0;
    const total = Math.max(0, Math.round(((subtotal - discount) + shipping) * 100) / 100);
    return { subtotal, discountRate, discount, shipping, total };
  }, [cart, user.level, user.email]);

  function addToCart(p: { sku: string; name: string; price: number }) {
    const sizes: string[] = (p as any).sizes || [];
    const chosen = selectedSize[p.sku] || sizes[0] || undefined;
    const stock = (p as any).stock?.[chosen as any] ?? 999;
    setCart((c) => {
      const i = c.findIndex((x) => x.sku === p.sku && x.size === chosen);
      const currentQty = i >= 0 ? c[i].qty : 0;
      if (currentQty >= stock) { alert("Stock esaurito per questa taglia"); return c; }
      if (i >= 0) { const copy = [...c]; copy[i] = { ...copy[i], qty: copy[i].qty + 1 }; return copy; }
      return [...c, { ...p, qty: 1, size: chosen }];
    });
  }

  function removeFromCart(index: number) {
    setCart((c) => c.filter((_, i) => i !== index));
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#EDEDED]">
      {/* NAV */}
      <header className="sticky top-0 z-40 bg-black/40 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-400" />
            <span className="font-semibold">LedVelvet</span>
          </a>
          <nav className="hidden md:flex gap-6 text-sm">
            <a href="#eventi" className="hover:opacity-80">Eventi</a>
            <a href="#membership" className="hover:opacity-80">Membership</a>
            <a href="#tessera" className="hover:opacity-80">Tessera</a>
            <a href="#shop" className="hover:opacity-80">Shop</a>
            <a href="#area" className="hover:opacity-80">Area Socio</a>
          </nav>
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20" onClick={() => setShowCart(true)}>Carrello (€{total})</button>
            {!user.email ? (
              <button onClick={() => setUser({ email: "demo@ledvelvet.it" })} className="px-3 py-2 rounded-2xl bg-white text-black">Accedi</button>
            ) : (
              <div className="flex items-center gap-2">
                <select className="bg-white/10 rounded-xl px-2 py-1 text-sm" value={user.level || "BASE"} onChange={(e) => setUser((u) => ({ ...u, level: e.target.value as any }))}>
                  <option value="BASE">BASE</option>
                  <option value="VIP">VIP</option>
                  <option value="FOUNDER">FOUNDER</option>
                </select>
                <button onClick={() => setUser({ email: null })} className="px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20">Esci</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="home" className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,38,255,0.25),transparent_40%),radial-gradient(circle_at_80%_50%,rgba(59,130,246,0.18),transparent_50%)]" />
        <div className="max-w-6xl mx-auto px-4 py-20 md:py-28">
          <h1 className="text-4xl md:text-6xl font-bold">Ethereal Clubbing <span className="opacity-70">in Unconventional Places</span></h1>
          <p className="mt-4 max-w-2xl opacity-80">Diventa socio, entra nel cerchio. Pre‑sale, priority list, sconti merch e tessera digitale con QR.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#membership" className="px-5 py-3 rounded-2xl bg-white text-black">Iscriviti alla Membership</a>
            <a href="#eventi" className="px-5 py-3 rounded-2xl bg-white/10">Prossimi Eventi</a>
            <a href="#shop" className="px-5 py-3 rounded-2xl bg-white/10">Shop il Drop</a>
          </div>
        </div>
      </section>

      {/* EVENTI */}
      <section id="eventi" className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-3xl font-semibold">Prossimi Eventi</h2>
          <span className="text-sm opacity-70">ticket via Xceed/Shotgun</span>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {events.map((e) => (
            <article key={e.id} className="rounded-2xl p-5 bg-white/5 border border-white/10">
              <div className="aspect-[16/9] rounded-xl bg-white/10 grid place-items-center mb-3">COVER</div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-medium">{e.name}</h3>
                  <p className="opacity-80 text-sm">{e.city} • {e.date}</p>
                </div>
                <a href={e.href} className="px-4 py-2 rounded-xl bg-white text-black">Compra</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* MEMBERSHIP */}
      <section id="membership" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-semibold mb-6">Membership APS</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {([
            { code: "BASE", price: 39, perks: ["Tessera digitale", "Pre‑sale 15'", "Sconto Shop 5%"] },
            { code: "VIP", price: 99, perks: ["Priority list", "Pre‑sale 60'", "Sconto Shop 10%", "Eventi solo soci"] },
            { code: "FOUNDER", price: 199, perks: ["Badge Founder", "Inviti speciali", "Sconto Shop 15%", "Meet & Greet"] },
          ] as const).map((m) => (
            <div key={m.code} className="rounded-2xl p-6 bg-white/5 border border-white/10 flex flex-col">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-semibold">{m.code}</h3>
                <span className="text-2xl font-bold">€{m.price}/anno</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm opacity-90">{m.perks.map((p) => (<li key={p}>• {p}</li>))}</ul>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => setShowKyc(true)} className="px-4 py-2 rounded-xl bg-white/10">KYC</button>
                <button onClick={() => alert(`Checkout membership ${m.code} (demo)`)} className="px-4 py-2 rounded-xl bg-white text-black">Iscriviti</button>
              </div>
            </div>
          ))}
        </div>

        {showKyc && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur grid place-items-center p-4" onClick={() => setShowKyc(false)}>
            <div className="w-full max-w-lg rounded-2xl bg-[#16161A] border border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-lg font-semibold mb-3">KYC – Dati Socio</h4>
              <div className="grid gap-3">
                <input placeholder="Nome" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                <input placeholder="Cognome" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                <input placeholder="Codice Fiscale" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                <input type="date" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="file" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                  <input type="file" className="px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                </div>
                <label className="text-sm opacity-80 flex items-center gap-2"><input type="checkbox" /> Consenso privacy/GDPR</label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="px-4 py-2 rounded-xl bg-white/10" onClick={() => setShowKyc(false)}>Annulla</button>
                <button className="px-4 py-2 rounded-xl bg-white text-black" onClick={() => { setUser((u) => ({ ...u, kyc: true })); setShowKyc(false); }}>Invia</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* TESSERA */}
      <section id="tessera" className="max-w-6xl mx-auto px-4 py-16">
        <div className="rounded-2xl p-6 bg-white/5 border border-white/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold">Tessera Digitale</h2>
              <p className="opacity-80">Aggiungi a Wallet e usa il QR per l'accesso.</p>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-white/10" onClick={() => setShowQR(true)}>Mostra QR</button>
              <button className="px-4 py-2 rounded-xl bg-white text-black">Aggiungi a Wallet</button>
            </div>
          </div>
          {showQR && (
            <div className="mt-6 grid place-items-center">
              <div className="p-4 rounded-2xl bg-white">
                <div className="w-40 h-40 bg-black grid place-items-center text-white">QR</div>
              </div>
              <p className="mt-2 text-sm opacity-70">#LV-{Math.floor(Math.random()*999999).toString().padStart(6,"0")}</p>
            </div>
          )}
        </div>
      </section>

      {/* SHOP */}
      <section id="shop" className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-3xl font-semibold">Shop</h2>
          <button className="px-4 py-2 rounded-xl bg-white text-black" onClick={() => setShowCart(true)}>Checkout (€{total})</button>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {products.map((p) => (
            <div key={p.sku} className="rounded-2xl p-5 bg-white/5 border border-white/10 flex flex-col">
              <div className="aspect-square rounded-xl bg-white/10 grid place-items-center mb-3">IMG</div>
              <h3 className="font-medium">{p.name}</h3>
              <p className="opacity-80">€{p.price}</p>
              {Array.isArray((p as any).sizes) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(p as any).sizes.map((s: string) => {
                    const inStock = (p as any).stock?.[s] > 0;
                    return (
                      <button key={s} disabled={!inStock} onClick={() => setSelectedSize((m) => ({ ...m, [p.sku]: s }))} className={`px-3 py-1 rounded-xl border ${selectedSize[p.sku]===s? 'bg-white text-black':'bg-white/0 border-white/20'} ${!inStock ? 'opacity-50 cursor-not-allowed' : ''}`}>{s}</button>
                    );
                  })}
                </div>
              )}
              <button onClick={() => addToCart(p)} className="mt-3 px-4 py-2 rounded-xl bg-white text-black">Aggiungi {selectedSize[p.sku] ? `( ${selectedSize[p.sku]} )` : ''}</button>
            </div>
          ))}
        </div>

        {/* Cart Drawer */}
        {showCart && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur z-50" onClick={() => setShowCart(false)}>
            <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[#16161A] border-l border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Il tuo carrello</h3>
                <button className="px-3 py-1 rounded-xl bg-white/10" onClick={() => setShowCart(false)}>Chiudi</button>
              </div>
              <div className="mt-4 space-y-3">
                {cart.length === 0 && <p className="opacity-70 text-sm">Il carrello è vuoto.</p>}
                {cart.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-xl p-3 bg-white/5 border border-white/10">
                    <div>
                      <div className="text-sm font-medium">{i.name} {i.size ? `(${i.size})` : ''}</div>
                      <div className="text-xs opacity-80">Qty {i.qty} • €{i.price}</div>
                    </div>
                    <button className="text-xs px-3 py-1 rounded-xl bg-white/10" onClick={() => removeFromCart(idx)}>Rimuovi</button>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl p-4 bg-white/5 border border-white/10 text-sm space-y-1">
                <div className="flex items-center justify-between"><span>Subtotale</span><span>€{subtotal}</span></div>
                <div className="flex items-center justify-between"><span>Sconto soci {discountRate*100}%</span><span>-€{discount}</span></div>
                <div className="flex items-center justify-between"><span>Spedizione</span><span>€{shipping}</span></div>
                <div className="flex items-center justify-between font-semibold text-base"><span>Totale</span><span>€{total}</span></div>
                <button className="w-full mt-3 px-4 py-2 rounded-xl bg-white text-black" onClick={() => alert(`Redirect a Stripe Checkout (demo) – Totale €${total}`)}>Procedi al pagamento</button>
              </div>
            </aside>
          </div>
        )}
      </section>

      {/* AREA SOCIO */}
      <section id="area" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-semibold mb-6">Area Socio</h2>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
            <h3 className="font-medium">Profilo</h3>
            <ul className="mt-2 text-sm opacity-90 space-y-1">
              <li>Email: {user.email ?? "–"}</li>
              <li>Livello: {user.level ?? "–"}</li>
              <li>KYC: {user.kyc ? "verificato" : "non verificato"}</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-white/10" onClick={() => setShowKyc(true)}>Completa KYC</button>
              <button className="px-4 py-2 rounded-xl bg-white text-black" onClick={() => alert("Collega acquisti Xceed/Shotgun (demo)")}>Collega acquisti</button>
            </div>
          </div>
          <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
            <h3 className="font-medium">Storico Presenze</h3>
            <ul className="mt-2 text-sm opacity-90 space-y-1">
              <li>25/11/2025 – CRYPTA – ticket VIP</li>
              <li>02/10/2025 – PETRA – guestlist</li>
              <li>15/07/2025 – HANGAR – tavolo</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-sm opacity-70">© {new Date().getFullYear()} LedVelvet APS • Privacy • Cookie • Termini</p>
          <div className="flex gap-3 text-sm">
            <a className="hover:opacity-80" href="#">Instagram</a>
            <a className="hover:opacity-80" href="#">TikTok</a>
            <a className="hover:opacity-80" href="#">Press Kit</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
