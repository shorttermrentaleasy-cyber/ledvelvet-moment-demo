"use client";

import React, { useEffect, useMemo, useState } from "react";

type DoorApiKeyRow = {
  id: string;
  label: string;
  api_key?: string | null;
  active?: boolean;
  created_at?: string | null;
  revoked_at?: string | null;
};

type ApiGetResponse = {
  ok: true;
  active: {
    id: string;
    label: string;
    api_key: string;
    created_at?: string | null;
  } | null;
  history: Array<{
    id: string;
    label: string;
    active: boolean;
    created_at?: string | null;
    revoked_at?: string | null;
  }>;
};

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return "********";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export default function DoorApiKeyClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [keys, setKeys] = useState<DoorApiKeyRow[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showActive, setShowActive] = useState(false);

  const [label, setLabel] = useState("rotated");
  const [manualKey, setManualKey] = useState("");
  const [rotating, setRotating] = useState(false);

  // Provisioning UI
  const [provLabel, setProvLabel] = useState("porta principale");
  const [provDeviceId, setProvDeviceId] = useState("ipad-ingresso-1");
  const [provTtl] = useState(30);
  const [provUrl, setProvUrl] = useState<string | null>(null);
  const [provExpiresAt, setProvExpiresAt] = useState<string | null>(null);
  const [provQrDataUrl, setProvQrDataUrl] = useState<string | null>(null);
  const [provLoading, setProvLoading] = useState(false);

  const activeRow = useMemo(() => keys.find((k) => k.active), [keys]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/door-api-keys", { cache: "no-store" });
      const j = (await r.json()) as any;

      if (!r.ok || !j?.ok) {
        setKeys([]);
        setActiveKey(null);
        setErr(j?.error || "Errore caricamento");
        return;
      }

      const data = j as ApiGetResponse;

      const activeApiKey = data.active?.api_key ? String(data.active.api_key) : null;
      setActiveKey(activeApiKey);

      const merged: DoorApiKeyRow[] = [];

      if (data.active) {
        merged.push({
          id: String(data.active.id),
          label: String(data.active.label || "active"),
          api_key: activeApiKey,
          active: true,
          created_at: data.active.created_at || null,
          revoked_at: null,
        });
      }

      for (const h of data.history || []) {
        const hid = String(h.id);
        if (data.active && hid === String(data.active.id)) continue;

        merged.push({
          id: hid,
          label: String(h.label || ""),
          api_key: null,
          active: !!h.active,
          created_at: h.created_at || null,
          revoked_at: h.revoked_at || null,
        });
      }

      setKeys(merged);
    } catch (e: any) {
      setKeys([]);
      setActiveKey(null);
      setErr(e?.message || "Errore rete");
    } finally {
      setLoading(false);
    }
  }

  async function rotate(useManual: boolean) {
    setRotating(true);
    setErr(null);
    try {
      const body: any = { label: (label || "rotated").trim() || "rotated" };
      if (useManual) {
        const mk = manualKey.trim();
        if (!mk) {
          setErr("Incolla una key manuale oppure usa 'genera key'.");
          setRotating(false);
          return;
        }
        body.api_key = mk;
      }

      const r = await fetch("/api/admin/door-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });

      const j = await r.json();

      if (!r.ok || !j?.ok) {
        setErr(j?.error || "Rotate fallita");
        return;
      }

      setManualKey("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Errore rete");
    } finally {
      setRotating(false);
    }
  }

  async function createProvisionQr() {
    setProvLoading(true);
    setErr(null);
    setProvUrl(null);
    setProvExpiresAt(null);
    setProvQrDataUrl(null);

    try {
      const r = await fetch("/api/admin/door-provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ttl_minutes: provTtl,
          label: (provLabel || "").trim() || null,
          device_id: (provDeviceId || "").trim() || null,
        }),
      });

      const j = await r.json();
      if (!r.ok || !j?.ok) {
        setErr(j?.error || "Provisioning fallito");
        return;
      }

      const url = String(j.provision_url || "").trim();
      setProvUrl(url);
      setProvExpiresAt(String(j.expires_at || "") || null);

      // genera PNG QR client-side
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 8,
      });

      setProvQrDataUrl(dataUrl);
    } catch (e: any) {
      setErr(e?.message || "Errore rete");
    } finally {
      setProvLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs text-white/50 tracking-widest">ADMIN • SETTINGS</div>
      <h1 className="mt-1 text-2xl font-semibold">Door API Key</h1>

      <div className="mt-3">
        <a
          href="/admin/"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
        >
          ← Torna a Settings
        </a>
      </div>

      <p className="mt-1 text-sm text-white/60">Gestisci la chiave usata da /api/doorcheck. Solo admin.</p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Key attiva</div>
            <div className="text-xs text-white/60">Questa è la chiave che i device devono salvare in DoorCheck (localStorage).</div>
          </div>

          <button
            type="button"
            onClick={() => setShowActive((v) => !v)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            {showActive ? "Nascondi" : "Mostra"}
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/40 px-3 py-3 font-mono text-sm">
          {!activeKey ? "Nessuna key attiva" : showActive ? activeKey : maskKey(activeKey)}
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!activeKey) return;
              await navigator.clipboard.writeText(activeKey);
            }}
            className="rounded-xl bg-white/80 text-black px-4 py-2 text-sm font-semibold hover:bg-white"
            disabled={!activeKey}
          >
            Copia key
          </button>

          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            disabled={loading}
          >
            {loading ? "Carico..." : "Ricarica"}
          </button>
        </div>
      </div>

      {/* Provisioning QR */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="text-sm font-semibold">Provisioning QR (TTL 30 min)</div>
        <div className="text-xs text-white/60 mt-1">
          Genera un QR temporaneo (one-time) che autorizza un device a salvare la Door API Key senza copiarla a mano.
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={provLabel}
            onChange={(e) => setProvLabel(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
            placeholder="device label (es: porta principale)"
          />
          <input
            value={provDeviceId}
            onChange={(e) => setProvDeviceId(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
            placeholder="device_id (es: ipad-ingresso-1)"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={createProvisionQr}
            disabled={provLoading}
            className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {provLoading ? "Creo QR..." : `Crea QR (scade in ${provTtl} min)`}
          </button>

          {provUrl ? (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(provUrl);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Copia link
            </button>
          ) : null}

          {provQrDataUrl ? (
            <a
              href={provQrDataUrl}
              download={`doorcheck_provision_${(provDeviceId || "device").replace(/\s+/g, "_")}.png`}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Scarica QR PNG
            </a>
          ) : null}
        </div>

        {provUrl ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/70 break-all">
            <div className="font-semibold text-white/80">Link provisioning</div>
            <div className="mt-1 font-mono">{provUrl}</div>
            {provExpiresAt ? (
              <div className="mt-2 text-[11px] text-white/50 font-mono">
                expires_at: {new Date(provExpiresAt).toLocaleString("it-IT")}
              </div>
            ) : null}
          </div>
        ) : null}

        {provQrDataUrl ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={provQrDataUrl} alt="Provision QR" className="w-64 h-64" />
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="text-sm font-semibold">Ruota / crea nuova key</div>
        <div className="text-xs text-white/60">“Rotate” disattiva le altre e crea una nuova key attiva.</div>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
          placeholder="label (es: rotated)"
        />

        <input
          value={manualKey}
          onChange={(e) => setManualKey(e.target.value)}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30 font-mono"
          placeholder="(opzionale) incolla key manuale — altrimenti la generiamo noi"
        />

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => rotate(false)}
            disabled={rotating}
            className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {rotating ? "Rotating..." : "Rotate (genera key)"}
          </button>

          <button
            type="button"
            onClick={() => rotate(true)}
            disabled={rotating || !manualKey.trim()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            Rotate (usa key manuale)
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="text-sm font-semibold">Storico</div>

        <div className="mt-3 space-y-2">
          {keys
            .filter((k) => !k.active)
            .map((k) => (
              <div key={k.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{k.label || "key"}</div>
                  <div className="text-[11px] text-white/50 font-mono">
                    {k.created_at ? new Date(k.created_at).toLocaleString("it-IT") : ""}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-white/40 font-mono">
                  revoked_at: {k.revoked_at ? new Date(k.revoked_at).toLocaleString("it-IT") : "—"}
                </div>
              </div>
            ))}
        </div>

        {err ? <div className="mt-3 text-sm text-red-300">{err}</div> : null}
      </div>
    </div>
  );
}
