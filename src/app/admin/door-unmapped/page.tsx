"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  xceed_email: string;
  event_id: string | null;
  scan_count: number;
  last_seen_at: string;
  last_qr_code: string | null;
};

export default function DoorUnmappedPage() {
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/door-unmapped");
    const json = await res.json();
    setItems(json.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(215,38,255,0.22),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.18),transparent_35%)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-8">
        
        {/* BACK */}
        <div className="mb-4">
          <button
            onClick={() => router.push("/admin")}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            ← Back
          </button>
        </div>

        {/* HEADER */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
          <p className="mb-2 text-xs uppercase tracking-[0.35em] text-fuchsia-300/80">
            LedVelvet DoorCheck
          </p>

          <h1 className="text-3xl font-bold md:text-5xl">
            Email non mappate
          </h1>

          <p className="mt-3 text-sm text-white/65">
            Email Xceed utilizzate negli accessi ma non ancora configurate nei gate.
          </p>
        </div>

        {/* CONTENT */}
        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white/70">
            Caricamento...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white/70">
            Nessuna email non mappata 👍
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="grid gap-4">
            {items.map((i) => (
              <div
                key={i.id}
                className="rounded-3xl border border-white/10 bg-[#111116]/90 p-5 shadow-xl backdrop-blur"
              >
                <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
                  
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-white">
                      {i.xceed_email}
                    </div>

                    <div className="mt-2 text-sm text-white/60">
                      Event: {i.event_id || "—"}
                    </div>

                    <div className="mt-1 text-sm text-white/60">
                      Scan: {i.scan_count}
                    </div>

                    <div className="mt-1 text-xs text-white/40">
                      Ultimo QR: {i.last_qr_code || "—"}
                    </div>
                  </div>

                  <div>
                    <button
                      className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-bold text-white hover:bg-fuchsia-400"
                      onClick={() =>
                        router.push(
                          `/admin/door-gates?email=${encodeURIComponent(i.xceed_email)}`
                        )
                      }
                    >
                      Crea Gate →
                    </button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
