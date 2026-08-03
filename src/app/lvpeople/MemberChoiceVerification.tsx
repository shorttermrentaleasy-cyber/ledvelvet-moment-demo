"use client";

import { FormEvent, useState } from "react";

export default function MemberChoiceVerification({ barcode, name }: { barcode: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const memberWindow = window.open("about:blank", "_blank");
    if (!memberWindow) {
      setError("Consenti l’apertura di nuove schede per aprire la tessera.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/member-verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode, phone }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.href) {
        memberWindow.close();
        setError(result?.error || "Verifica non riuscita.");
        return;
      }

      memberWindow.opener = null;
      memberWindow.location.href = result.href;
    } catch {
      memberWindow.close();
      setError("Verifica non riuscita. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="block w-full rounded-xl border border-white/10 bg-black/25 p-4 text-left transition hover:border-fuchsia-300/30 hover:bg-white/5">
        <span className="block font-semibold">{name}</span>
        <span className="mt-1 block text-xs text-white/55">Tessera …{barcode.slice(-5)}</span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-fuchsia-300/25 bg-black/35 p-4">
      <div className="font-semibold">{name}</div>
      <div className="mt-1 text-xs text-white/55">Tessera …{barcode.slice(-5)}</div>
      <label className="mt-4 block text-sm text-white/75">Inserisci il cellulare associato a questa tessera</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required
        className="mt-2 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-white outline-none focus:border-fuchsia-300/50" />
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button disabled={busy} className="rounded-lg bg-gradient-to-r from-[#8d003f] to-[#e00072] px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {busy ? "Verifica…" : "Apri tessera"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Annulla</button>
      </div>
    </form>
  );
}
