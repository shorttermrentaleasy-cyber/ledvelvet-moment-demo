"use client";

import React, { useCallback, useEffect } from "react";

export default function AboutOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const handleClose = useCallback(() => onClose(), [onClose]);

  // lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // esc close
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/85"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* panel */}
      <div className="absolute inset-0 flex justify-center">
        <div className="relative w-full max-w-5xl h-full bg-[#0B0B0C]">
          {/* header sticky */}
          <div className="sticky top-0 z-10 border-b border-[var(--red-acc)]/30 bg-[#0B0B0C]">
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="text-[11px] tracking-[0.22em] uppercase text-white/60">
                Led Velvet • About
              </div>

              <button
                onClick={handleClose}
                className="px-4 py-2 bg-white/10 border border-white/20 text-white text-xs tracking-[0.18em] uppercase hover:bg-white/15 hover:border-white/35"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* body scroll */}
          <div className="h-[calc(100%-60px)] overflow-y-auto">
            <div className="px-6 py-10 md:py-14">
              <h1 className="text-4xl md:text-5xl font-semibold leading-tight text-white">
                Led Velvet
              </h1>
              <p className="mt-4 max-w-3xl text-base md:text-lg text-white/80 whitespace-pre-line">
                Led Velvet is an organization devoted to orchestrating unparalleled and captivating events,
                distinguished by a seamless blend of music and unconventional venues. Each event is meticulously
                crafted to transport participants into unforgettable experiences, transcending the boundaries of
                space and time.
              </p>

              <div className="mt-10 grid gap-8">
                <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Mission</div>
                  <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
                    Led Velvet is committed to transforming each event into a special occasion by combining
                    evocative settings with curated musical selections and refined atmospheres. The association’s
                    mission is to create a perfect synergy between music and location, offering evenings that
                    skillfully balance the past and present, leaving an indelible mark in the memories of the
                    participants.
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Events</div>
                  <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
                    Led Velvet’s events are a sensory journey that allows participants to immerse themselves in
                    historic and enchanting settings. From Tuscan villages to ancient spaces transformed into
                    vintage lounges, every detail is meticulously crafted to offer a unique experience. Music,
                    entrusted to talented DJs, serves as a central element that accompanies and amplifies the
                    emotions of party.
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">Special Projects</div>
                  <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
                    Among the association’s distinctive projects, the “Loyalty Club” has been conceived to
                    celebrate and reward the loyalty of Led Velvet’s community members. This program offers
                    exclusive benefits and unique experiences, reserved for those who actively participate and
                    share in the association’s journey.
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="text-[11px] tracking-[0.22em] uppercase text-white/50">
                    Collaborations & Innovations
                  </div>
                  <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
                    Led Velvet embraces innovation and experimentation. Over time, this vision has evolved into a
                    recurring format: a series of special events hosted in major cities, inside selected clubs
                    that become temporary homes for our identity.
                    {"\n\n"}
                    This format began with Milano Velluto, created during Women’s Fashion Week, and continued with
                    Firenze Velluto, further expanding our presence within Italy’s most vibrant urban scenes.
                    {"\n\n"}
                    Led Velvet is synonymous with elegance, a passion for music, and attention to detail. With a
                    unique and innovative approach to event organization, the association continues to create
                    magical and unrepeatable moments for its community, always with a focus on quality and
                    excellence.
                  </p>
                </article>

                <div className="h-16" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
