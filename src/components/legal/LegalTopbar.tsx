"use client";

import { useRouter, usePathname } from "next/navigation";

export default function LegalTopbar({
  homeHref = "/moment2",
  label = "Legal",
}: {
  homeHref?: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function closeModal() {
    // ✅ chiusura corretta del modal slot
    router.back();

    // 🔒 fallback: se per qualche motivo dopo un attimo siamo ancora qui, forza home
    setTimeout(() => {
      const p = window.location.pathname || "";
      if (p === pathname) {
        router.replace(homeHref);
      }
    }, 120);
  }

  return (
    <div className="relative z-[30000] flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/25 backdrop-blur-md">
      <button
        type="button"
        onClick={closeModal}
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
      >
        Chiudi
      </button>

      <div className="text-sm text-white/60 tracking-wide">{label}</div>

      
    </div>
  );
}
