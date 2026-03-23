"use client";

import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

const WALLY_IFRAME_URL =
  "https://wallyfor.com/iframepass/index.php?ref=1d7439beb34f751e1db481e40592079e&agenteget=";

function sanitizeInternalPath(p: string | null): string {
  if (!p) return "/moment2#home";
  if (!p.startsWith("/")) return "/moment2#home";
  if (p.startsWith("//")) return "/moment2#home";
  if (p.includes("://")) return "/moment2#home";
  return p;
}

export default function BecomeMemberPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromRaw = searchParams.get("from");
  const from = sanitizeInternalPath(fromRaw);

  return (
    <main className="min-h-screen bg-[#050505] text-white overflow-hidden">
      {/* background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#930b0c]/20 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-red-900/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* TOP BAR */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push(from)}
            className="inline-flex items-center rounded-full border border-white/15 bg-black/40 backdrop-blur px-4 py-2 text-xs tracking-[0.18em] uppercase text-white/80 hover:bg-white/10 hover:border-white/30 hover:text-white transition"
          >
            ← Back
          </button>

          <div className="text-[10px] md:text-[11px] tracking-[0.24em] uppercase text-white/40">
            LedVelvet Society
          </div>
        </div>

        {/* CARD */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_30px_100px_rgba(0,0,0,0.55)] overflow-hidden">
          {/* HEADER */}
          <div className="relative border-b border-white/10 px-5 md:px-8 py-6 md:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,11,12,0.22),transparent_40%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_35%)]" />

            <div className="relative">
              <div className="text-[11px] tracking-[0.24em] uppercase text-white/45">
                Membership
              </div>

              <h1 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-white">
                Become a member
              </h1>

              <p className="mt-4 max-w-2xl text-sm md:text-base text-white/70 leading-relaxed">
                Join the LedVelvet circle and access the membership experience.
                Complete your registration below.
              </p>
            </div>
          </div>

          {/* IFRAME */}
          <div className="p-3 md:p-4 bg-black/20">
            <div className="rounded-[22px] overflow-hidden border border-white/10 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <iframe
                src={WALLY_IFRAME_URL}
                title="LedVelvet Membership"
                className="w-full bg-black"
                style={{ height: "1170px", border: "0" }}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </div>

          {/* FOOTER (solo branding, niente bottone) */}
          <div className="flex items-center justify-between border-t border-white/10 px-5 md:px-8 py-4 bg-black/20">
            <div className="text-xs tracking-[0.18em] uppercase text-white/40">
              LedVelvet • Ethereal Clubbing
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}