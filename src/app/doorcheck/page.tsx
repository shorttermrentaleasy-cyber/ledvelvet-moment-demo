"use client";

import React, { useMemo, useState } from "react";

/**
 * MVP PIN ingresso
 * (hardcoded apposta – lo renderemo gestibile da admin più avanti)
 */
const DOOR_PIN = "1979";

type DoorcheckResponse =
  | {
      ok: true;
      allowed: boolean;
      reason: string;
      method?: string;
      member?: {
        id: string;
        first_name: string;
        last_name: string;
        email?: string | null;
        legacy?: boolean;
      };
    }
  | { ok: false; error: string };

export default function DoorCheckPage() {
  const [eventId, setEventId] = useState("");
  const [deviceId, setDeviceId] = useState("ipad-ingresso-1");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<DoorcheckResponse | null>(null);

  // PIN state
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("doorcheck_pin_ok") === "1";
  });

  const ok = useMemo(() => (res && "ok" in res ? res.ok : false), [res]);
  const allowed = useMemo(
    () => (res && "allowed" in res ? res.allowed : false),
    [res]
  );

  function checkPin() {
    if (pin.trim() === DOOR_PIN) {
      localStorage.setItem("doorcheck_pin_ok", "1");
      setPinOk(true);
    } else {
      alert("PIN errato");
    }
  }

  function resetPin() {
    localStorage.removeItem("doorcheck_pin_ok");
    setPin("");
    setPinOk(false);
    setRes(null);
    setQr("");
  }

  async function doCheck() {
    const eid = eventId.trim();
    const did = deviceId.trim();
    const code = qr.trim();

    if (!eid || !code) {
      setRes({ ok: false, error: "Compila event_id e QR/Barcode." });
      return;
    }

    setLoading(true);
    setRes(null);

    try {
      const r = await fetch("/api/doorcheck-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          event_id: eid,
          qr: code,
          device_id: did || undefined,
        }),
      });

      const data = (await r.json()) as DoorcheckResponse;
      setRes(data);

      // UX MVP: se accesso OK, puliamo il campo per lo scan successivo
      if (data && "allowed" in data && data.allowed) {
        setQr("");
      }
    } catch (e: any) {
      setRes({ ok: false, error: e?.message || "Errore rete" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">DoorCheck</h1>
            <p className="mt-1 text-white/60 text-sm">
              Controllo ingressi – QR / Barcode (MVP)
            </p>
          </div>
          <span className="text-xs text-white/40 border border-white/10 rounded-full px-3 py-1">
            /doorcheck
          </span>
        </header>

        {/* ===== PIN ACCESSO STAFF ===== */}
        {!pinOk && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Accesso staff</h2>
            <p className="mt-1 text-sm text-white/60">
              Inserisci il PIN per abilitare il controllo ingressi.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN ingresso"
                className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm outline-none"
              />
              <button
                onClick={checkPin}
                className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
              >
                Sblocca
              </button>
            </div>
          </section>
        )}

        {/* ===== DOORCHECK UI ===== */}
        {pinOk && (
          <>
            <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs text-white/60 mb-1">event_id</div>
                  <input
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    placeholder="UUID evento"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  />
                </label>

                <label className="block">
                  <div className="text-xs text-white/60 mb-1">device_id</div>
                  <input
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="ipad-ingresso-1"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
                  />
                </label>
              </div>

              <label className="block mt-4">
                <div className="text-xs text-white/60 mb-1">QR / Barcode</div>
                <input
                  value={qr}
                  onChange={(e) => setQr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doCheck();
                  }}
                  placeholder="Scansiona o incolla qui (Enter)"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-base outline-none focus:border-white/30 font-mono"
                  autoFocus
                />
                <div className="mt-2 text-xs text-white/40">
                  Scanner “tastiera” supportato.
                </div>
              </label>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={doCheck}
                  disabled={loading}
                  className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Controllo..." : "Check"}
                </button>

                <button
                  onClick={() => {
                    setRes(null);
                    setQr("");
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  Reset scan
                </button>
              </div>
            </section>

            {/* ===== RISULTATO ===== */}
            <section className="mt-4">
              {!res ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                  Nessun controllo ancora.
                </div>
              ) : "ok" in res && res.ok ? (
                <div
                  className={`rounded-2xl border p-5 ${
                    allowed
                      ? "border-emerald-400/30 bg-emerald-400/10"
                      : "border-red-400/30 bg-red-400/10"
                  }`}
                >
                  <div className="text-lg font-semibold">
                    {allowed ? "✅ ACCESSO OK" : "⛔ ACCESSO NEGATO"}
                  </div>
                  <div className="mt-2 text-sm font-mono">
                    reason: {res.reason}
                  </div>
                  {res.member && (
                    <div className="mt-3 text-sm">
                      {res.member.first_name} {res.member.last_name}{" "}
                      {res.member.legacy && "(legacy)"}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
                  <div className="text-lg font-semibold">Errore</div>
                  <div className="mt-2 text-sm font-mono">
                    {(res as any).error}
                  </div>
                </div>
              )}
            </section>

            <button
              onClick={resetPin}
              className="mt-6 text-xs text-white/40 underline"
            >
              Reset PIN
            </button>
          </>
        )}
      </div>
    </main>
  );
}
