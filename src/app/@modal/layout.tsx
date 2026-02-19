"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function ModalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const y = window.scrollY || 0;
    try {
      sessionStorage.setItem("lv_bg_scroll_y", String(y));
    } catch {}

    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPosition = body.style.position;
    const prevTop = body.style.top;
    const prevWidth = body.style.width;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";

    return () => {
      body.style.overflow = prevOverflow;
      body.style.position = prevPosition;
      body.style.top = prevTop;
      body.style.width = prevWidth;

      let yy = y;
      try {
        const v = sessionStorage.getItem("lv_bg_scroll_y");
        if (v) yy = Number(v) || y;
      } catch {}

      // ✅ ripristina scroll della pagina sotto
      window.scrollTo(0, yy);
    };
  }, []);

  function close() {
    // ✅ se siamo in una route modal, back è la chiusura corretta (mantiene scroll)
    // fallback: se per qualche motivo non torna, vai a /moment2
    router.back();
    setTimeout(() => {
      // se dopo il back siamo ancora su una pagina modal, forza moment2
      const p = window.location.pathname || "";
      if (p === pathname) {
        router.replace("/moment2");
      }
    }, 120);
  }

  return (
    <div className="fixed inset-0 z-[40000]">
      {/* backdrop sotto */}
      <button
        aria-label="Chiudi"
        onClick={close}
        type="button"
        className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm"
      />

      {/* frame sopra */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-3 md:p-10">
        <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-black">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0d0018] to-black" />
          <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-purple-900/25 blur-[170px] rounded-full" />
          <div className="absolute -bottom-48 -right-48 w-[640px] h-[640px] bg-fuchsia-800/15 blur-[210px] rounded-full" />

          <div className="relative z-10 max-h-[85vh] overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
