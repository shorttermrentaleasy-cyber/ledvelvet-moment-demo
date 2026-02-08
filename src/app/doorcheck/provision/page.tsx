"use client";

import React, { useEffect, useState } from "react";

const LS_KEY_API = "doorcheck_api_key";
const LS_KEY_DEVICE = "doorcheck_device_id";

export default function DoorcheckProvisionPage() {
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [msg, setMsg] = useState<string>("Provisioning…");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const token = (url.searchParams.get("t") || "").trim();
        if (!token) {
          setStatus("err");
          setMsg("Token mancante (link non valido).");
          return;
        }

        const r = await fetch("/api/doorcheck/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
        });

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          setStatus("err");
          setMsg(j?.error || "Provisioning fallito.");
          return;
        }

        const api_key = String(j.api_key || "").trim();
        const device_id = String(j.device_id || "").trim();
        if (!api_key) {
          setStatus("err");
          setMsg("Risposta incompleta: api_key mancante.");
          return;
        }

        try {
          localStorage.setItem(LS_KEY_API, api_key);
          if (device_id) localStorage.setItem(LS_KEY_DEVICE, device_id);
        } catch {}

        setStatus("ok");
        setMsg("✅ Device autorizzato. Reindirizzo a DoorCheck…");

        setTimeout(() => {
          window.location.href = "/doorcheck";
        }, 600);
      } catch (e: any) {
        setStatus("err");
        setMsg(e?.message || "Errore inatteso.");
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-xl font-semibold">DoorCheck Provisioning</div>
        <div className="mt-2 text-sm text-white/70">{msg}</div>

        {status === "err" ? (
          <div className="mt-4 text-xs text-white/50">
            Suggerimento: chiedi allo staff un nuovo QR (questo può essere scaduto o già usato).
          </div>
        ) : null}
      </div>
    </main>
  );
}
