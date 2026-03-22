"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DeepDiveListItem = {
  airtable_record_id: string;
  slug: string;
  is_published: boolean;
  event_ref: string[];
  venue_ref: string[];
  event_date: string;
  title_override: string;
  subtitle: string;
  sort_order: number | null;
  lineup_video_url?: string | null;
};

function fmtDate(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function toTime(v: string) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function hasReel(v?: string | null) {
  return !!String(v || "").trim();
}

export default function AdminDeepDiveListPage() {
  const palette = useMemo(
    () => ({
      bg: "#050505",
      surface: "#080808",
      surface2: "#0c0c0c",
      text: "#F5F5F5",
      muted: "rgba(245,245,245,0.70)",
      border: "rgba(255,255,255,0.10)",
      redAccent: "#930b0c",
    }),
    []
  );

  const [items, setItems] = useState<DeepDiveListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/admin/deepdive", {
          cache: "no-store",
          signal: controller.signal,
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Cannot load deepdive list");
        }

        const rawItems = Array.isArray(json?.items) ? (json.items as DeepDiveListItem[]) : [];

        const sorted = [...rawItems].sort((a, b) => {
          const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
          const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;

          if (aOrder !== bOrder) return aOrder - bOrder;

          const dateDiff = toTime(b.event_date) - toTime(a.event_date);
          if (dateDiff !== 0) return dateDiff;

          return (a.title_override || "").localeCompare(b.title_override || "", "it", {
            sensitivity: "base",
          });
        });

        setItems(sorted);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(e?.message || "Unexpected error");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  async function handleDelete(slug: string) {
    const ok = window.confirm(
      `Vuoi davvero eliminare la Experience "${slug}"?\n\nQuesta azione non è reversibile.`
    );
    if (!ok) return;

    try {
      setDeletingSlug(slug);

      const res = await fetch(`/api/admin/deepdive/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Delete failed");
      }

      setItems((prev) => prev.filter((item) => item.slug !== slug));
    } catch (e: any) {
      alert(e?.message || "Errore durante la cancellazione");
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--text)]"
      style={{
        ["--bg" as any]: palette.bg,
        ["--surface" as any]: palette.surface,
        ["--surface2" as any]: palette.surface2,
        ["--text" as any]: palette.text,
        ["--muted" as any]: palette.muted,
        ["--border" as any]: palette.border,
        ["--red-accent" as any]: palette.redAccent,
      }}
    >
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Admin</div>
            <h1 className="text-xl font-semibold">DeepDive / Experience</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Online solo se <span className="text-[var(--text)]">is_published</span> ✅. Lo slug è
              formula: non si modifica.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/deepdive/create"
              className="px-4 py-2 rounded-full bg-white text-black text-xs tracking-[0.18em] uppercase font-semibold"
            >
              + Create
            </Link>

            <Link
              href="/admin"
              className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
            >
              Back
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : err ? (
          <div className="border border-white/10 bg-[var(--surface2)] p-4">
            <div className="text-sm text-[var(--text)]">Errore</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{err}</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border border-white/10 bg-[var(--surface2)]">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-xs tracking-[0.22em] uppercase text-[var(--muted)]">
                  <tr>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Reel</th>
                    <th className="text-left p-3">Order</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Slug</th>
                    <th className="text-left p-3">Title</th>
                    <th className="text-left p-3">Subtitle</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td className="p-4 text-[var(--muted)]" colSpan={8}>
                        Nessuna Experience trovata in EVENT_DEEPDIVE.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const isDeleting = deletingSlug === it.slug;
                      const reelOk = hasReel(it.lineup_video_url);

                      return (
                        <tr
                          key={it.airtable_record_id || it.slug}
                          className="border-t border-white/10 hover:bg-white/5"
                        >
                          <td className="p-3">
                            {it.is_published ? (
                              <span className="inline-flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                Published
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                Draft
                              </span>
                            )}
                          </td>

                          <td className="p-3">
                            {reelOk ? (
                              <span className="inline-flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                Reel OK
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                                No Reel
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-white/80">
                            {it.sort_order ?? <span className="text-white/40">—</span>}
                          </td>

                          <td className="p-3 text-white/80">{fmtDate(it.event_date)}</td>

                          <td className="p-3 font-mono text-xs text-white/80">{it.slug}</td>

                          <td className="p-3">
                            {it.title_override || <span className="text-white/40">—</span>}
                          </td>

                          <td className="p-3 text-white/70">
                            {it.subtitle || <span className="text-white/40">—</span>}
                          </td>

                          <td className="p-3">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <Link
                                href={`/admin/deepdive/${encodeURIComponent(it.slug)}`}
                                className="inline-flex items-center px-4 py-2 rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase"
                              >
                                Edit
                              </Link>

                              <Link
                              href={`/upload/deepdive-lineup-video/${encodeURIComponent(it.slug)}`}
                              className="inline-flex items-center justify-center px-4 py-2 min-w-[132px] rounded-full border border-white/15 hover:border-white/30 hover:bg-white/10 text-xs tracking-[0.18em] uppercase text-center"
                              >
                              Upload Reel
                              </Link>

                              <button
                                type="button"
                                onClick={() => handleDelete(it.slug)}
                                disabled={isDeleting}
                                className="inline-flex items-center px-4 py-2 rounded-full border border-red-900/60 bg-red-950/40 hover:bg-red-950/70 text-xs tracking-[0.18em] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 text-xs text-[var(--muted)]">
              Crei/colleghi una Experience in Airtable aggiungendo una riga in{" "}
              <span className="text-[var(--text)]">EVENT_DEEPDIVE</span> e selezionando{" "}
              <span className="text-[var(--text)]">event_ref</span>.
            </div>
          </>
        )}
      </div>
    </div>
  );
}