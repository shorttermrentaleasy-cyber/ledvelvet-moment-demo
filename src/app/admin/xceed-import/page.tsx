"use client";

import React, { useEffect, useMemo, useState } from "react";
import AdminTopbarClient from "../AdminTopbarClient";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["csv", "xlsx", "xls"]);
const ALLOWED_TYPES = new Set([
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

type AirtableEvent = {
  id: string; // rec...
  name?: string;
  date?: string;
  city?: string;
  venue?: string;
  ticketPlatform?: string;
  ticketUrl?: string;
};

type UploadResp =
  | { ok: true; batch_id: string; file_path: string }
  | { ok: false; error: string };

type ProcessResp =
  | {
      ok: true;
      batch_id: string;
      event_id: string; // UUID Supabase usato per import
      file_path: string;
      detected?: any;
      rows_total: number;
      rows_inserted: number;
    }
  | { ok: false; error: string };

type SaveFlagsResp =
  | { ok: true; event: { id: string; require_ticket: boolean; require_membership: boolean } }
  | { ok: false; error: string };

function isXceedEvent(ev: AirtableEvent | null) {
  if (!ev) return false;
  const plat = String(ev.ticketPlatform || "").toUpperCase();
  const url = String(ev.ticketUrl || "").toLowerCase();
  return plat === "XCEED" || url.includes("xceed");
}

export default function AdminXceedImportPage() {
  const [events, setEvents] = useState<AirtableEvent[]>([]);
  const [eventId, setEventId] = useState(""); // Airtable rec...
  const [file, setFile] = useState<File | null>(null);

  const [uploadRes, setUploadRes] = useState<UploadResp | null>(null);
  const [processRes, setProcessRes] = useState<ProcessResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [busyUpload, setBusyUpload] = useState(false);
  const [busyProcess, setBusyProcess] = useState(false);

  // Flags (DoorCheck) salvati su public.events
  const [supabaseEventId, setSupabaseEventId] = useState<string>("");
  const [requireTicket, setRequireTicket] = useState<boolean>(false);
  const [requireMembership, setRequireMembership] = useState<boolean>(false);
  const [busyFlags, setBusyFlags] = useState(false);
  const [flagsRes, setFlagsRes] = useState<SaveFlagsResp | null>(null);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === eventId) || null,
    [events, eventId]
  );

  const selectedEventLabel = useMemo(() => {
    if (!selectedEvent) return "";
    const bits = [
      selectedEvent.name || "",
      selectedEvent.date ? `(${selectedEvent.date})` : "",
      selectedEvent.city ? `- ${selectedEvent.city}` : "",
    ].filter(Boolean);
    return bits.join(" ");
  }, [selectedEvent]);

  useEffect(() => {
    // Menu = Airtable
    fetch("/api/public/events", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j?.events) ? (j.events as AirtableEvent[]) : [];
        setEvents(list);
        if (list.length === 1) setEventId(list[0].id);
      })
      .catch(() => setError("Errore caricando eventi (Airtable)"));
  }, []);

  // Reset quando cambio evento
  useEffect(() => {
    setUploadRes(null);
    setProcessRes(null);
    setFlagsRes(null);
    setSupabaseEventId("");
    setRequireTicket(false);
    setRequireMembership(false);
    setError(null);
    // non resettare il file automaticamente
  }, [eventId]);

  async function doUpload() {
    if (!eventId || !file) {
      setError("Seleziona evento e file");
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop() || "";
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_TYPES.has(file.type)) {
      setError("Formato non valido. Usa CSV, XLSX o XLS.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      setError("File troppo grande (max 10 MB).");
      return;
    }

    const selected = events.find((e) => e.id === eventId);
    if (!selected) {
      setError("Evento non trovato in lista (Airtable).");
      return;
    }

    setBusyUpload(true);
    setError(null);
    setUploadRes(null);
    setProcessRes(null);
    setFlagsRes(null);

    try {
      // 1) ensure-event: ottieni UUID Supabase (rigido su ticketUrl se XCEED)
      const ensureResp = await fetch("/api/admin/xceed-import/ensure-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          airtable_event_id: selected.id, // rec...
          name: selected.name || "",
          date: selected.date || "",
          city: selected.city || "",
          venue: selected.venue || "",
          ticketPlatform: selected.ticketPlatform || "",
          ticketUrl: selected.ticketUrl || "",
        }),
      });

      const ensureJson = await ensureResp.json();
      if (!ensureJson?.ok) {
        setError(ensureJson?.error || "ensure-event fallito");
        return;
      }

      const sbEventId = String(ensureJson.supabase_event_id || "").trim();
      if (!sbEventId) {
        setError("ensure-event non ha restituito supabase_event_id");
        return;
      }

      // ✅ ora abbiamo l'UUID evento su cui salvare i bool
      setSupabaseEventId(sbEventId);

      // default flags (MVP): require_ticket coerente con XCEED; membership lo decidi tu
      const defaultRequireTicket = isXceedEvent(selected);
      setRequireTicket(defaultRequireTicket);
      setRequireMembership(false);

      // 2) upload batch usando UUID Supabase
      const fd = new FormData();
      fd.append("event_id", sbEventId);
      fd.append("file", file);

      const r = await fetch("/api/admin/xceed-import/upload", {
        method: "POST",
        body: fd,
      });

      const j = await r.json();
      setUploadRes(j);

      if (!j.ok) setError(j.error || "Upload fallito");
    } catch (e: any) {
      setError(e?.message || "Upload fallito");
    } finally {
      setBusyUpload(false);
    }
  }

  async function saveFlags() {
    if (!supabaseEventId) {
      setError("Prima fai Upload (serve creare/agganciare evento su Supabase).");
      return;
    }

    setBusyFlags(true);
    setError(null);
    setFlagsRes(null);

    try {
      const r = await fetch("/api/admin/events/set-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: supabaseEventId,
          require_ticket: requireTicket,
          require_membership: requireMembership,
        }),
      });

      const j = (await r.json()) as SaveFlagsResp;
      setFlagsRes(j);

      if (!j.ok) setError(j.error || "Salvataggio regole fallito");
    } catch (e: any) {
      setError(e?.message || "Salvataggio regole fallito");
    } finally {
      setBusyFlags(false);
    }
  }

  async function doProcess() {
    if (!uploadRes || !uploadRes.ok) return;
    setBusyProcess(true);
    setError(null);

    try {
      const r = await fetch("/api/admin/xceed-import/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: uploadRes.batch_id }),
      });
      const j = await r.json();
      setProcessRes(j);
      if (!j.ok) setError(j.error || "Process fallito");
    } finally {
      setBusyProcess(false);
    }
  }

  const missingTicketUrlForXceed =
    !!selectedEvent &&
    String(selectedEvent.ticketPlatform || "").toUpperCase() === "XCEED" &&
    !String(selectedEvent.ticketUrl || "").trim();

  return (
    <div className="min-h-screen bg-black text-white flex justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
        <AdminTopbarClient backHref="/admin" />

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Xceed Import</h1>
          <p className="text-sm text-white/50 mt-1">
            Selezione evento da Airtable · Import biglietti su Supabase · Regole DoorCheck su public.events
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* 1) Upload */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-medium mb-4">1) Upload file Xceed</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/60 mb-1">Evento (Airtable)</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded-xl bg-black border border-white/10 px-3 py-2 text-sm"
              >
                <option value="">— seleziona evento —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name || ev.id}
                  </option>
                ))}
              </select>

              {selectedEventLabel && (
                <div className="text-xs text-white/40 mt-1">Selezionato: {selectedEventLabel}</div>
              )}

              {missingTicketUrlForXceed && (
                <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                  Questo evento ha Ticket Platform = XCEED ma Ticket Url è vuoto su Airtable.
                  Import bloccato: aggiungi Ticket Url su Airtable e riprova.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-1">File CSV / XLSX</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white/80"
              />
            </div>

            <button
              onClick={doUpload}
              disabled={busyUpload || missingTicketUrlForXceed}
              className="rounded-xl bg-red-600/80 hover:bg-red-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              {busyUpload ? "Upload…" : "Upload e crea batch"}
            </button>
          </div>

          {uploadRes?.ok && (
            <div className="mt-4 text-xs text-white/60">
              Upload Done → Batch ID:{" "}
              <span className="text-white/90 font-mono">{uploadRes.batch_id}</span>
            </div>
          )}

          {supabaseEventId ? (
            <div className="mt-2 text-xs text-white/40">
              Supabase event_id: <span className="font-mono text-white/80">{supabaseEventId}</span>
            </div>
          ) : null}
        </div>

        {/* 1b) Flags */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-medium mb-2">1b) Regole DoorCheck (evento)</h2>
          <p className="text-xs text-white/50 mb-4">
            Queste regole vengono salvate su <span className="font-mono">public.events</span> e sono usate dal DoorCheck.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Require ticket</div>
                <div className="text-xs text-white/50">Se ON: serve biglietto valido (Xceed)</div>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={requireTicket}
                  onChange={(e) => setRequireTicket(e.target.checked)}
                  className="h-4 w-4 accent-red-600"
                  disabled={!supabaseEventId}
                />
              </label>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Require membership</div>
                <div className="text-xs text-white/50">Se ON: serve socio ETS (tessera)</div>
              </div>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={requireMembership}
                  onChange={(e) => setRequireMembership(e.target.checked)}
                  className="h-4 w-4 accent-red-600"
                  disabled={!supabaseEventId}
                />
              </label>
            </div>

            <button
              onClick={saveFlags}
              disabled={!supabaseEventId || busyFlags}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm disabled:opacity-40"
            >
              {busyFlags ? "Salvo…" : "Salva regole evento"}
            </button>

            {flagsRes?.ok ? (
              <div className="text-xs text-white/60">
                Salvato: require_ticket={" "}
                <span className="text-white/90 font-mono">{String(flagsRes.event.require_ticket)}</span>{" "}
                · require_membership={" "}
                <span className="text-white/90 font-mono">{String(flagsRes.event.require_membership)}</span>
              </div>
            ) : null}

            {!supabaseEventId ? (
              <div className="text-xs text-white/40">
                Nota: per salvare le regole devi prima fare Upload (ensure-event crea/aggancia l’evento su Supabase).
              </div>
            ) : null}
          </div>
        </div>

        {/* 2) Process */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-medium mb-2">2) Process batch</h2>
          <p className="text-xs text-white/50 mb-4">Parse file · Upsert idempotente · Audit garantito</p>

          <button
            onClick={doProcess}
            disabled={!uploadRes?.ok || busyProcess}
            className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm disabled:opacity-40"
          >
            {busyProcess ? "Processing…" : "Process batch"}
          </button>

          {processRes?.ok && (
            <div className="mt-4 text-sm text-white/70">
              Importati <span className="text-white font-medium">{processRes.rows_inserted}</span> /{" "}
              {processRes.rows_total}
            </div>
          )}
        </div>

        <div className="text-center text-xs text-white/30">
          LedVelvet Admin · Xceed Import · Bridge Airtable→Supabase controllato
        </div>
      </div>
    </div>
  );
}
