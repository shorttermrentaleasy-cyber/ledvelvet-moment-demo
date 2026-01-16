"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type EventOption = { id: string; name: string };

export default function AdminDeepDiveCreatePage() {
  const router = useRouter();

  const palette = useMemo(
    () => ({
      bg: "#050505",
      surface: "#080808",
      surface2: "#0c0c0c",
      text: "#F5F5F5",
      muted: "rgba(245,245,245,0.70)",
      border: "rgba(255,255,255,0.10)",
    }),
    []
  );

  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [published, setPublished] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/admin/deepdive?mode=events&limit=100", { cache: "no-store" });
        const j = await res.json().catch(() => null);

        if (!res.ok || !j?.ok) throw new Error(j?.error || "Cannot load events");

        if (!alive) return;
        setEvents(Array.isArray(j.items) ? j.items : []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Unexpected error");
        setEvents([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function onCreate() {
    if (!eventId) return setErr("Seleziona un evento");

    try {
      setSaving(true);
      setErr(null);

      const res = await fetch("/api/admin/deepdive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, is_published: published }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || j?.detail || "Create failed");

      // torna lista (o se vuoi, possiamo aprire direttamente l’edit leggendo lo slug dalla record appena creato)
      router.push("/admin/deepdive?refresh=1");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: palette.bg,
        color: palette.text,
      }}
    >
      {/* Topbar */}
      <div className="sticky top-0 z-10 border-b border-white/10" style={{ background: palette.surface }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.22em] uppercase" style={{ color: palette.muted }}>
              Admin
            </div>
            <h1 className="text-xl font-semibold">Create Experience</h1>
            <p className="mt-1 text-xs" style={{ color: palette.muted }}>
              Qui scegli solo <b>event_ref</b>. Lo slug lo genera Airtable (formula).
            </p>
          </div>

          <Link
            href="/admin/deepdive"
            className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {err ? (
          <div className="border border-white/10 p-4 mb-6" style={{ background: palette.surface2 }}>
            <div className="text-sm">Errore</div>
            <div className="mt-1 text-xs" style={{ color: palette.muted }}>
              {err}
            </div>
          </div>
        ) : null}

        <div className="border border-white/10 p-6" style={{ background: palette.surface2 }}>
          {loading ? (
            <div className="text-sm" style={{ color: palette.muted }}>
              Loading…
            </div>
          ) : (
            <>
              <div className="text-xs mb-2" style={{ color: palette.muted }}>
                Event (event_ref)
              </div>

              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full px-3 py-3 text-sm border border-white/15 bg-black/40 outline-none"
              >
                <option value="">— seleziona evento —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>

              <div className="mt-5 flex items-center gap-3">
                <input
                  id="pub"
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                <label htmlFor="pub" className="text-sm">
                  Published <span style={{ color: palette.muted }}>(puoi lasciarlo Draft e pubblicare dopo)</span>
                </label>
              </div>

              <div className="mt-8 flex justify-end gap-2">
                <Link
                  href="/admin/deepdive"
                  className="px-5 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
                >
                  Cancel
                </Link>

                <button
                  onClick={onCreate}
                  disabled={saving}
                  className="px-6 py-2 rounded-full bg-white text-black text-xs tracking-[0.18em] uppercase disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create"}
                </button>
              </div>

              <div className="mt-4 text-[11px]" style={{ color: palette.muted }}>
                Tip: se non vedi un evento qui, controlla che sia nella tabella EVENTS e che l’API abbia accesso.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
