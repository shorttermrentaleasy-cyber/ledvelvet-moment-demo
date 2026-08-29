"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Gate = {
  id: string;
  gate_id: string;
  name: string;
  door_role: string;
  xceed_email: string;
  active: boolean;
};

type DoorEvent = {
  id: string;
  name: string;
  starts_at: string | null;
  venue: string | null;
  city: string | null;
};

const emptyForm = {
  gate_id: "",
  name: "",
  door_role: "ordinary",
  xceed_email: "",
  active: true,
};

function roleLabel(role: string) {
  if (role === "loyalty") return "Loyalty";
  if (role === "privileged") return "Privileged";
  return "Ordinary";
}

function DoorGatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [gates, setGates] = useState<Gate[]>([]);
  const [events, setEvents] = useState<DoorEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    door_role: "ordinary",
    xceed_email: "",
    active: true,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [linkBusyGateId, setLinkBusyGateId] = useState<string | null>(null);
  const [linkFeedback, setLinkFeedback] = useState("");
  const [linkError, setLinkError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/door-gates");
    const json = await res.json();
    setGates(json.gates || []);
    setLoading(false);
  }

  async function loadEvents() {
    setEventsLoading(true);
    const res = await fetch("/api/admin/analytics-events", {
      cache: "no-store",
    });
    const json = await res.json();
    const rows = (json.events || []) as DoorEvent[];

    setEvents(rows);
    setSelectedEventId((current) => {
      if (current && rows.some((event) => event.id === current)) return current;

      const now = Date.now();
      const upcoming = rows
        .filter((event) => {
          const time = event.starts_at ? new Date(event.starts_at).getTime() : 0;
          return Number.isFinite(time) && time >= now;
        })
        .sort(
          (left, right) =>
            new Date(left.starts_at || 0).getTime() -
            new Date(right.starts_at || 0).getTime()
        );

      return upcoming[0]?.id || rows[0]?.id || "";
    });
    setEventsLoading(false);
  }

  async function copyToClipboard(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function prepareGateLink(gate: Gate, action: "open" | "copy") {
    setLinkFeedback("");
    setLinkError("");

    if (!selectedEventId) {
      setLinkError("Seleziona prima un evento.");
      return;
    }

    const openedWindow = action === "open" ? window.open("about:blank", "_blank") : null;
    setLinkBusyGateId(gate.gate_id);

    try {
      const res = await fetch("/api/admin/event-gate-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          gate_id: gate.gate_id,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok || !json.link) {
        openedWindow?.close();
        throw new Error(json.error || "Errore nella creazione del link.");
      }

      if (action === "open") {
        if (openedWindow) {
          openedWindow.location.href = json.link;
        } else {
          window.location.href = json.link;
        }
        setLinkFeedback(`Fast Check aperto per ${gate.name}.`);
      } else {
        await copyToClipboard(json.link);
        setLinkFeedback(`Link copiato per ${gate.name}.`);
      }
    } catch (err: any) {
      openedWindow?.close();
      setLinkError(err?.message || "Errore nella creazione del link.");
    } finally {
      setLinkBusyGateId(null);
    }
  }

  async function toggleActive(gate: Gate) {
    await fetch(`/api/admin/door-gates/${gate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !gate.active }),
    });

    await load();
  }

  function startEdit(gate: Gate) {
    setEditError("");
    setEditingId(gate.id);
    setEditForm({
      name: gate.name,
      door_role: gate.door_role,
      xceed_email: gate.xceed_email,
      active: gate.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
    setEditForm({
      name: "",
      door_role: "ordinary",
      xceed_email: "",
      active: true,
    });
  }

  async function saveEdit(id: string) {
    setEditError("");
    setEditSaving(true);

    const res = await fetch(`/api/admin/door-gates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setEditError(json.error || "Errore modifica gate");
      setEditSaving(false);
      return;
    }

    setEditSaving(false);
    cancelEdit();
    await load();
  }

  async function createGate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const res = await fetch("/api/admin/door-gates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(json.error || "Errore salvataggio gate");
      setSaving(false);
      return;
    }

    setForm(emptyForm);
    setSaving(false);
    await load();
  }

  useEffect(() => {
    load();
    loadEvents();

    const email = searchParams.get("email");
    if (email) {
      setForm((prev) => ({
        ...prev,
        xceed_email: email,
      }));
    }
  }, [searchParams]);

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,38,255,0.22),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.18),transparent_35%)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
          <div className="mb-4">
            <button
              onClick={() => router.push("/admin")}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              ← Back
            </button>
          </div>

          <p className="mb-2 text-xs uppercase tracking-[0.35em] text-fuchsia-300/80">
            LedVelvet DoorCheck
          </p>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                Gestione Gates
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                Configura i gate DoorCheck e collega ogni ingresso alla relativa
                email Xceed usata dallo staff in fase di scan.
              </p>
            </div>

            <button
              onClick={load}
              className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              Aggiorna
            </button>
          </div>
        </div>

        <section className="mb-8 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5 shadow-xl backdrop-blur">
          <div className="grid gap-4 md:grid-cols-[1fr_1.4fr] md:items-end">
            <div>
              <h2 className="text-xl font-bold">Link Fast Check per evento</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Seleziona l&apos;evento, poi apri o copia il link del gate. Al
                primo utilizzo vengono conservati ruolo ed email Xceed validi
                per quello specifico evento.
              </p>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-white/75">
              Evento
              <select
                value={selectedEventId}
                onChange={(event) => {
                  setSelectedEventId(event.target.value);
                  setLinkFeedback("");
                  setLinkError("");
                }}
                disabled={eventsLoading || events.length === 0}
                className="rounded-2xl border border-white/10 bg-[#16161A] px-4 py-3 text-white outline-none focus:border-cyan-300/60 disabled:opacity-50"
              >
                {events.length === 0 && (
                  <option value="">
                    {eventsLoading ? "Caricamento eventi..." : "Nessun evento disponibile"}
                  </option>
                )}
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.starts_at
                      ? new Date(event.starts_at).toLocaleDateString("it-IT")
                      : "Senza data"}
                    {" · "}
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {linkFeedback && (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">
              {linkFeedback}
            </div>
          )}

          {linkError && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {linkError}
            </div>
          )}
        </section>

        <form
          onSubmit={createGate}
          className="mb-8 rounded-3xl border border-white/10 bg-[#111116]/90 p-5 shadow-xl backdrop-blur"
        >
          <h2 className="mb-4 text-xl font-bold">Aggiungi nuovo gate</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome gate es. Ingresso Main"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-fuchsia-400/60"
            />

            <input
              value={form.gate_id}
              onChange={(e) => setForm({ ...form, gate_id: e.target.value })}
              placeholder="Gate ID es. gate_4"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-fuchsia-400/60"
            />

            <input
              value={form.xceed_email}
              onChange={(e) =>
                setForm({ ...form, xceed_email: e.target.value })
              }
              placeholder="Email Xceed associata"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-fuchsia-400/60"
            />

            <select
              value={form.door_role}
              onChange={(e) =>
                setForm({ ...form, door_role: e.target.value })
              }
              className="rounded-2xl border border-white/10 bg-[#16161A] px-4 py-3 text-white outline-none focus:border-fuchsia-400/60"
            >
              <option value="ordinary">Ordinary</option>
              <option value="loyalty">Loyalty</option>
              <option value="privileged">Privileged</option>
            </select>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.checked })
                }
              />
              Gate attivo
            </label>

            <button
              disabled={saving}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "Crea gate"}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </form>

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white/70">
            Caricamento gates...
          </div>
        )}

        {!loading && gates.length > 0 && (
          <div className="grid gap-4">
            {gates.map((g) => {
              const isEditing = editingId === g.id;

              return (
                <section
                  key={g.id}
                  className="rounded-3xl border border-white/10 bg-[#111116]/90 p-5 shadow-xl backdrop-blur"
                >
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">
                          {g.gate_id}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            g.active
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {g.active ? "ATTIVO" : "DISATTIVATO"}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-4 grid gap-3">
                          <input
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                name: e.target.value,
                              })
                            }
                            placeholder="Nome gate"
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-fuchsia-400/60"
                          />

                          <input
                            value={editForm.xceed_email}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                xceed_email: e.target.value,
                              })
                            }
                            placeholder="Email Xceed"
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-fuchsia-400/60"
                          />

                          <select
                            value={editForm.door_role}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                door_role: e.target.value,
                              })
                            }
                            className="rounded-2xl border border-white/10 bg-[#16161A] px-4 py-3 text-white outline-none focus:border-fuchsia-400/60"
                          >
                            <option value="ordinary">Ordinary</option>
                            <option value="loyalty">Loyalty</option>
                            <option value="privileged">Privileged</option>
                          </select>

                          <label className="flex items-center gap-3 text-sm text-white/70">
                            <input
                              type="checkbox"
                              checked={editForm.active}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  active: e.target.checked,
                                })
                              }
                            />
                            Gate attivo
                          </label>

                          {editError && (
                            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                              {editError}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <h2 className="mt-4 truncate text-2xl font-bold text-white">
                            {g.name}
                          </h2>

                          <div className="mt-3 grid gap-2 text-sm text-white/65 md:grid-cols-2">
                            <div>
                              <span className="text-white/40">Ruolo:</span>{" "}
                              <span className="font-semibold text-white/85">
                                {roleLabel(g.door_role)}
                              </span>
                            </div>

                            <div className="truncate">
                              <span className="text-white/40">
                                Email Xceed:
                              </span>{" "}
                              <span className="font-semibold text-white/85">
                                {g.xceed_email}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex w-full flex-col gap-2 md:w-auto">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(g.id)}
                            disabled={editSaving}
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black hover:bg-white/90 disabled:opacity-50"
                          >
                            {editSaving ? "Salvataggio..." : "Salva modifiche"}
                          </button>

                          <button
                            onClick={cancelEdit}
                            className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                          >
                            Annulla
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => prepareGateLink(g, "open")}
                            disabled={
                              !g.active ||
                              !selectedEventId ||
                              linkBusyGateId === g.gate_id
                            }
                            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {linkBusyGateId === g.gate_id
                              ? "Preparazione..."
                              : "Apri Fast Check"}
                          </button>

                          <button
                            type="button"
                            onClick={() => prepareGateLink(g, "copy")}
                            disabled={
                              !g.active ||
                              !selectedEventId ||
                              linkBusyGateId === g.gate_id
                            }
                            className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Copia link
                          </button>

                          <button
                            onClick={() => startEdit(g)}
                            className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                          >
                            Modifica
                          </button>

                          <button
                            onClick={() => toggleActive(g)}
                            className={`rounded-2xl px-5 py-3 text-sm font-bold transition ${
                              g.active
                                ? "bg-white text-black hover:bg-white/90"
                                : "bg-fuchsia-500 text-white hover:bg-fuchsia-400"
                            }`}
                          >
                            {g.active ? "Disattiva gate" : "Riattiva gate"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function DoorGatesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Caricamento...</div>}>
      <DoorGatesContent />
    </Suspense>
  );
}
