"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function FastDoorClient() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"idle" | "ok" | "no">("idle");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const eventId =
    searchParams.get("event_id") || "6ebab3cf-67dc-47c9-b5f9-92527a0c51f2";

  useEffect(() => {
    inputRef.current?.focus();

    // fullscreen auto
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  async function handleScan(value: string) {
    const code = value.trim();
    if (!code || loading) return;

    setLoading(true);

    try {
      const res = await fetch("/api/door/fast-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: eventId,
          code,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setStatus("ok");
        new Audio("/ok.mp3").play().catch(() => {});
        navigator.vibrate?.(100);
      } else {
        setStatus("no");
        new Audio("/no.mp3").play().catch(() => {});
        navigator.vibrate?.([100, 50, 100]);
      }
    } catch {
      setStatus("no");
      new Audio("/no.mp3").play().catch(() => {});
    }

    setTimeout(() => {
      setStatus("idle");
      setLoading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
      }
    }, 700);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleScan(e.currentTarget.value);
    }
  }

  return (
    <div
      className="flex h-screen w-full items-center justify-center bg-black text-white"
      onClick={() => inputRef.current?.focus()} // iOS fix
    >
      <div className="flex flex-col items-center gap-8 px-4">
        {/* SEMAFORO */}
        <div
          className={`h-64 w-64 rounded-full transition-all duration-150 ${
            status === "ok"
              ? "bg-green-500 shadow-[0_0_80px_rgba(34,197,94,0.9)]"
              : status === "no"
              ? "bg-red-500 shadow-[0_0_80px_rgba(239,68,68,0.9)]"
              : "bg-white/10"
          }`}
        />

        {/* TESTO */}
        <div className="text-5xl font-black tracking-widest">
          {status === "idle" && "SCAN"}
          {status === "ok" && "OK"}
          {status === "no" && "NO"}
        </div>

        {/* INPUT NASCOSTO */}
        <input
          ref={inputRef}
          onKeyDown={onKeyDown}
          className="opacity-0 absolute"
          autoFocus
        />

        {/* DEBUG EVENTO */}
        <div className="text-xs text-white/30">Evento: {eventId}</div>
      </div>
    </div>
  );
}