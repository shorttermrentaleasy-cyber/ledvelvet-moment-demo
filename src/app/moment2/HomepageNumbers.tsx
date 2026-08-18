"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Metrics = {
  members: number;
  tickets: number;
  checkins: number;
  events: number;
};

const EMPTY: Metrics = { members: 0, tickets: 0, checkins: 0, events: 0 };

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT").format(Math.max(0, Math.round(value)));
}

function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let started = false;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || started) return;
        started = true;
        const start = performance.now();
        const duration = 1200;

        const animate = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setShown(value * eased);
          if (progress < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        observer.disconnect();
      },
      { threshold: 0.25 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span ref={ref}>{formatNumber(shown)}</span>;
}

export default function HomepageNumbers() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("section#home");
    if (!hero?.parentElement) return;

    let target = document.getElementById("lv-homepage-numbers-host");
    if (!target) {
      target = document.createElement("div");
      target.id = "lv-homepage-numbers-host";
      hero.insertAdjacentElement("afterend", target);
    }
    setHost(target);

    return () => {
      if (target?.parentElement) target.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/numbers", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json?.ok || !json?.metrics) throw new Error("metrics_unavailable");
        return json.metrics as Metrics;
      })
      .then((next) => {
        if (cancelled) return;
        setMetrics(next);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => [
      { label: "LV People", value: metrics.members, note: "community" },
      { label: "Tickets", value: metrics.tickets, note: "valid tickets" },
      { label: "Check-ins", value: metrics.checkins, note: "real accesses" },
      { label: "Events", value: metrics.events, note: "experiences" },
    ],
    [metrics]
  );

  if (!host || !ready) return null;

  return createPortal(
    <section className="relative overflow-hidden border-y border-white/10 bg-[#070707] text-white" aria-label="LEDVELVET in numbers">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(700px circle at 16% 20%, rgba(147,11,12,.28), transparent 58%), radial-gradient(650px circle at 88% 80%, rgba(255,255,255,.06), transparent 62%)" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/80 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-red-300/80">LEDVELVET IN NUMBERS</div>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">A community measured in real moments.</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-white/50 md:text-right">People, tickets, entrances and events. Four numbers that grow with every LEDVELVET experience.</p>
        </div>

        <div className="mt-10 grid grid-cols-2 border-l border-t border-white/10 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="group relative min-h-[160px] border-b border-r border-white/10 bg-white/[0.025] p-5 transition duration-300 hover:bg-white/[0.055] md:min-h-[190px] md:p-7">
              <div className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-red-500 transition-transform duration-500 group-hover:scale-x-100" />
              <div className="text-[10px] uppercase tracking-[0.26em] text-white/45">{item.note}</div>
              <div className="mt-5 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl md:text-6xl">
                <AnimatedNumber value={item.value} />
              </div>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-white/35">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Live data from LEDVELVET operations
        </div>
      </div>
    </section>,
    host
  );
}
